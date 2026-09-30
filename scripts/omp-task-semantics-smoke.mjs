import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, extname, join, resolve } from "node:path";

function run(command, args, cwd) {
  try {
    return execFileSync(command, args, {
      cwd,
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
      timeout: 360_000,
    }).trim();
  } catch (error) {
    const detail = [error.stderr, error.stdout].filter(Boolean).join("\n").trim();
    throw new Error(`${command} ${args.join(" ")} failed${detail ? `:\n${detail}` : ""}`, {
      cause: error,
    });
  }
}

async function walk(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(path));
    else if (entry.isFile()) files.push(path);
  }
  return files;
}

async function readJsonl(path) {
  return (await readFile(path, "utf8"))
    .split(/\r?\n/u)
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line));
}

function toolCalls(entries) {
  return entries
    .filter((entry) => entry.type === "message" && entry.message?.role === "assistant")
    .flatMap((entry) => entry.message.content
      .filter((block) => block.type === "toolCall")
      .map((block) => ({ id: block.id, name: block.name, arguments: block.arguments })));
}

function toolCallEntryIndex(entries, callId) {
  return entries.findIndex((entry) =>
    entry.type === "message" &&
    entry.message?.role === "assistant" &&
    entry.message.content.some((block) => block.type === "toolCall" && block.id === callId)
  );
}

function toolResultFor(entries, callId) {
  return entries.find((entry) =>
    entry.type === "message" &&
    entry.message?.role === "toolResult" &&
    entry.message.toolCallId === callId
  );
}

function shellQuote(value) {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function parentPrompt(repository, releasePath) {
  const agentId = "TaskSemanticsProbe";
  const runningMarker = "RUNNING_INSTRUCTION_6d13";
  const completionMarker = "TASK_COMPLETION_6d13";
  const postCompletionInstruction = "POST_COMPLETION_INSTRUCTION_6d13";
  const postCompletionReply = "POST_COMPLETION_REPLY_6d13";
  const releaseFile = shellQuote(releasePath);
  const runningCommand = `printf '%s\\n' 'SHELL_ACTIVE_6d13'; while [ ! -e ${releaseFile} ]; do sleep 2; done`;
  const releaseCommand = `touch ${releaseFile}; pwd`;
  const request = {
    context: "One harmless non-isolated Task in a disposable committed fixture. It may print cwd and create one temporary release marker outside the fixture; no repository files may be read or changed.",
    tasks: [{
      name: agentId,
      agent: "task",
      solutionSpace: "one barrier-controlled shell process and two parent-message acknowledgements",
      task: [
        `Use bash to run this exact command as your first tool call, without reading or modifying the fixture: ${JSON.stringify(runningCommand)}`,
        `Do not create ${releaseFile} until the parent sends ${runningMarker}. When it arrives, run this command with bash: ${JSON.stringify(releaseCommand)}. Wait for the first command to finish, then report your cwd, ${completionMarker}, and the received running marker.`,
        `After yielding, if the parent sends ${postCompletionInstruction}, reply exactly ${postCompletionReply} without tools.`,
      ].join(" "),
    }],
  };
  return [
    'Call task exactly once with this batch request; use the "task" agent for its item and do not add isolated:true:',
    JSON.stringify(request),
    `Record the returned agent ID from Task details.progress[0].id and the job ID from details.async.jobId separately. Read proc://<jobId>, then history://<agentId> until the Bash call containing SHELL_ACTIVE_6d13 is visible. OMP may return a background-job handle immediately; do not wait for a matching shell result or require a pending marker. Send ${runningMarker} as soon as the call is visible, before the shell finishes.`,
    "Consume Task results when they auto-deliver; use wait only when blocked, without IDs, and repeat it only as needed. A wait may return a peer message or multiple settled jobs.",
    `Only after the Task result arrives, send ${postCompletionInstruction} to the same agent ID. Then use wait without IDs only if blocked, until ${postCompletionReply} is received. Do not read either resource in the same turn as the write; only after the reply arrives, read both agent://<agentId> and history://<agentId>.`,
    "Return only JSON with agentId, jobId, cwd, completionMarker, runningMarker, and postCompletionReply. Do not call any tools other than task, read, write, and wait.",
    `The parent cwd is ${repository}. Never access files in the fixture.`,
  ].join("\n");
}

async function main() {
  const model = process.env.PSTACK_OMP_SMOKE_MODEL?.trim();
  if (!model) throw new Error("Set PSTACK_OMP_SMOKE_MODEL to a configured OMP model selector.");

  const ompVersion = run("omp", ["--version"]);
  assert.equal(ompVersion, "omp/18.4.3", `Expected OMP 18.4.3, got ${ompVersion}`);

  const temporaryRoot = await mkdtemp(join(tmpdir(), "pstack-omp-task-semantics-"));
  let succeeded = false;
  try {
    const repository = join(temporaryRoot, "repo");
    const sessions = join(temporaryRoot, "sessions");
    const configPath = join(temporaryRoot, "config.yml");
    const releasePath = join(temporaryRoot, "release-marker");
    await Promise.all([
      mkdir(repository, { recursive: true }),
      mkdir(sessions, { recursive: true }),
    ]);
    await writeFile(join(repository, "fixture.txt"), "unchanged\n");
    run("git", ["init", "--quiet"], repository);
    run("git", ["config", "user.name", "OMP Task semantics smoke"], repository);
    run("git", ["config", "user.email", "omp-task-semantics@example.invalid"], repository);
    run("git", ["add", "fixture.txt"], repository);
    run("git", ["commit", "--quiet", "-m", "smoke baseline"], repository);
    const baselineHead = run("git", ["rev-parse", "HEAD"], repository);
    await writeFile(configPath, [
      "async:",
      "  enabled: true",
      "task:",
      "  batch: true",
      "  speculativeLaunch: false",
      "  agentIdleTtlMs: 60000",
      "bash:",
      "  autoBackground:",
      "    enabled: true",
      "",
    ].join("\n"));

    run("omp", [
      "--session-dir", sessions,
      "--cwd", repository,
      "--config", configPath,
      "--model", model,
      "--mode", "json",
      "--print",
      "--no-title",
      "--no-extensions",
      "--no-skills",
      "--no-rules",
      "--tools=task,read,write,wait",
      "--approval-mode=yolo",
      "--max-time", "240",
      parentPrompt(repository, releasePath),
    ], repository);

    assert.equal(run("git", ["status", "--porcelain=v1", "--untracked-files=all"], repository), "");
    assert.equal(run("git", ["rev-parse", "HEAD"], repository), baselineHead);
    assert.equal(await readFile(join(repository, "fixture.txt"), "utf8"), "unchanged\n");

    const files = await walk(sessions);
    const parentLogs = files.filter((path) => dirname(path) === sessions && extname(path) === ".jsonl");
    assert.equal(parentLogs.length, 1, `Expected one parent session JSONL, found ${parentLogs.length}`);
    const parentLog = parentLogs[0];
    const parentName = basename(parentLog);
    const parentEntries = await readJsonl(parentLog);
    const calls = toolCalls(parentEntries);
    const taskCalls = calls.filter((call) => call.name === "task");
    assert.equal(taskCalls.length, 1, "Parent must call Task exactly once");
    const taskCall = taskCalls[0];
    assert.equal(taskCall.arguments?.tasks?.length, 1, "Parent must spawn exactly one Task item");
    const taskResult = toolResultFor(parentEntries, taskCall.id);
    const agentId = taskResult?.message?.details?.progress?.[0]?.id;
    const jobId = taskResult?.message?.details?.async?.jobId;
    assert.ok(agentId, "Task result did not expose its child agent ID");
    assert.ok(jobId, "Task result did not expose its async job ID");

    const childLogs = files.filter((path) => extname(path) === ".jsonl" && dirname(path) !== sessions);
    const childRecords = [];
    for (const path of childLogs) {
      const entries = await readJsonl(path);
      const header = entries.find((entry) => entry.type === "session");
      if (basename(header?.parentSession ?? "") === parentName) {
        childRecords.push({ path, entries, header });
      }
    }
    assert.equal(childRecords.length, 1, `Expected one child session for parent, found ${childRecords.length}`);
    assert.equal(basename(childRecords[0].path, extname(childRecords[0].path)), agentId, "Parent created an additional child session");

    const child = childRecords[0];

    const procCall = calls.find((call) => call.name === "read" && call.arguments?.path === `proc://${jobId}`);
    assert.ok(procCall, "Parent did not inspect the live job");
    const procResult = toolResultFor(parentEntries, procCall.id);
    assert.ok(procResult && JSON.stringify(procResult.message).includes("running"), "The proc read did not observe a running Task");

    const runningWriteCall = calls.find((call) => call.name === "write" && call.arguments?.path === `agent://${agentId}` && call.arguments?.content?.includes("RUNNING_INSTRUCTION_6d13"));
    assert.ok(runningWriteCall, "Parent did not message the running child");
    const runningWriteIndex = toolCallEntryIndex(parentEntries, runningWriteCall.id);
    const preflightHistoryCall = calls
      .filter((call) => call.name === "read" && call.arguments?.path === `history://${agentId}`)
      .filter((call) => toolCallEntryIndex(parentEntries, call.id) < runningWriteIndex)
      .at(-1);
    assert.ok(preflightHistoryCall, "Parent did not inspect child history before the running message");
    const preflightHistoryResult = toolResultFor(parentEntries, preflightHistoryCall.id);
    const preflightHistory = preflightHistoryResult?.message?.content?.map((block) => block.text ?? "").join("\n") ?? "";
    const bashLine = preflightHistory.split(/\r?\n/u).find((line) =>
      line.startsWith("→ bash(") && line.includes("SHELL_ACTIVE_6d13")
    );
    assert.ok(bashLine, "Parent did not observe the barrier-controlled Bash call before messaging the child");
    assert.ok(toolCallEntryIndex(parentEntries, preflightHistoryCall.id) < runningWriteIndex, "Running message preceded shell-start evidence");

    const postCompletionWriteCall = calls.find((call) => call.name === "write" && call.arguments?.path === `agent://${agentId}` && call.arguments?.content?.includes("POST_COMPLETION_INSTRUCTION_6d13"));
    assert.ok(postCompletionWriteCall, "Parent did not follow up with the completed child");
    const postCompletionWriteIndex = toolCallEntryIndex(parentEntries, postCompletionWriteCall.id);
    assert.ok(calls.filter((call) => call.name === "wait").every((call) => {
      const args = call.arguments ?? {};
      return !("id" in args) && !("jobId" in args) && !("agentId" in args);
    }), "Parent passed an identifier to wait");
    const asyncResultIndex = parentEntries.findIndex((entry, index) =>
      index < postCompletionWriteIndex &&
      entry.type === "custom_message" &&
      entry.customType === "async-result" &&
      JSON.stringify(entry).includes("TASK_COMPLETION_6d13")
    );
    const waitResultIndex = parentEntries.findIndex((entry, index) =>
      index < postCompletionWriteIndex &&
      entry.type === "message" &&
      entry.message?.role === "toolResult" &&
      entry.message.toolName === "wait" &&
      entry.message.details?.jobs?.some((job) => job.id === jobId && job.status === "completed") &&
      JSON.stringify(entry.message).includes("TASK_COMPLETION_6d13")
    );
    assert.ok(asyncResultIndex >= 0 || waitResultIndex >= 0, "Parent followed up before receiving the completed Task result");

    const postCompletionReplyIndex = parentEntries.findIndex((entry) =>
      (entry.type === "custom_message" && entry.customType === "irc:incoming" && entry.details?.message?.includes("POST_COMPLETION_REPLY_6d13")) ||
      (entry.type === "message" && entry.message?.role === "toolResult" && entry.message.toolName === "wait" && JSON.stringify(entry.message).includes("POST_COMPLETION_REPLY_6d13"))
    );
    assert.ok(postCompletionReplyIndex > postCompletionWriteIndex, "Parent did not receive the follow-up reply before inspecting resources");

    const artifactCall = calls
      .filter((call) => call.name === "read" && call.arguments?.path === `agent://${agentId}`)
      .findLast((call) => toolCallEntryIndex(parentEntries, call.id) > postCompletionReplyIndex);
    const historyCall = calls
      .filter((call) => call.name === "read" && call.arguments?.path === `history://${agentId}`)
      .findLast((call) => toolCallEntryIndex(parentEntries, call.id) > postCompletionReplyIndex);
    assert.ok(artifactCall, "Parent did not inspect the completed Task result artifact after the reply");
    assert.ok(historyCall, "Parent did not inspect the child transcript after the reply");
    const artifactResult = toolResultFor(parentEntries, artifactCall.id);
    const historyResult = toolResultFor(parentEntries, historyCall.id);
    assert.ok(artifactResult && JSON.stringify(artifactResult.message).includes("TASK_COMPLETION_6d13"), "Task result artifact omitted its completion marker");
    assert.ok(!JSON.stringify(artifactResult.message).includes("POST_COMPLETION_REPLY_6d13"), "Task result artifact incorrectly changed after follow-up");
    assert.ok(historyResult && JSON.stringify(historyResult.message).includes("POST_COMPLETION_REPLY_6d13"), "History transcript omitted the completed-session reply");
    assert.equal(resolve(child.header.cwd), resolve(repository), "Child cwd did not inherit the fixture root");


    const incomingIrc = child.entries.filter((entry) => entry.type === "custom_message" && entry.customType === "irc:incoming");
    const runningMessage = child.entries.find((entry) =>
      (entry.type === "custom_message" && entry.customType === "irc:incoming" && entry.details?.message?.includes("RUNNING_INSTRUCTION_6d13")) ||
      (entry.type === "message" && entry.message?.role === "toolResult" && entry.message.toolName === "wait" && entry.message.details?.waited?.body?.includes("RUNNING_INSTRUCTION_6d13")) ||
      (entry.type === "message" && entry.message?.role === "user" && entry.message.steering === true && JSON.stringify(entry.message.content).includes("RUNNING_INSTRUCTION_6d13"))
    );
    const postCompletionMessage = incomingIrc.find((entry) => entry.details?.message?.includes("POST_COMPLETION_INSTRUCTION_6d13"));
    assert.ok(runningMessage, "Running message was not delivered to the child");
    assert.ok(postCompletionMessage, "Post-completion message was not delivered to the same child");
    const shellCall = toolCalls(child.entries).find((call) => call.name === "bash" && JSON.stringify(call.arguments).includes("SHELL_ACTIVE_6d13"));
    assert.ok(shellCall, "Child did not start the barrier-controlled shell command");
    const shellResult = toolResultFor(child.entries, shellCall.id);
    assert.equal(shellResult?.message?.details?.async?.state, "running", "OMP did not return a live background Bash job");
    const shellJobId = shellResult.message.details.async.jobId;
    assert.ok(shellJobId, "The background Bash tool result omitted its job ID");
    const releaseCall = toolCalls(child.entries).find((call) =>
      call.name === "bash" && JSON.stringify(call.arguments).includes(`touch ${shellQuote(releasePath)}`)
    );
    assert.ok(releaseCall, "The child did not release the barrier after receiving the running message");
    assert.ok(child.entries.indexOf(runningMessage) < toolCallEntryIndex(child.entries, releaseCall.id), "The child released the shell before receiving the running message");
    const shellCompletion = child.entries.find((entry) =>
      entry.type === "custom_message" &&
      entry.customType === "async-result" &&
      entry.details?.jobs?.some((job) => job.jobId === shellJobId && job.type === "bash") &&
      JSON.stringify(entry).includes("SHELL_ACTIVE_6d13")
    );
    assert.ok(shellCompletion, "The child did not receive the background Bash completion");
    const childAssistantText = child.entries
      .filter((entry) => entry.type === "message" && entry.message?.role === "assistant")
      .flatMap((entry) => entry.message.content.filter((block) => block.type === "text").map((block) => block.text));
    const replyIndex = child.entries.findIndex((entry) =>
      entry.type === "message" &&
      entry.message?.role === "assistant" &&
      entry.message.content.some((block) => block.type === "text" && block.text.trim() === "POST_COMPLETION_REPLY_6d13")
    );
    const yieldIndex = child.entries.findIndex((entry) =>
      entry.type === "message" &&
      entry.message?.role === "assistant" &&
      entry.message.content.some((block) =>
        block.type === "toolCall" &&
        block.name === "yield" &&
        JSON.stringify(block.arguments).includes("TASK_COMPLETION_6d13")
      )
    );
    assert.ok(shellCompletion && child.entries.indexOf(shellCompletion) < yieldIndex, "Child yielded before receiving the background shell result");
    assert.ok(yieldIndex >= 0 && yieldIndex < child.entries.indexOf(postCompletionMessage), "Completed-session follow-up arrived before the child yielded its Task result");
    assert.ok(replyIndex > child.entries.indexOf(postCompletionMessage), "The completed child did not answer its follow-up");
    assert.ok(childAssistantText.some((text) => text.trim() === "POST_COMPLETION_REPLY_6d13"), "The same child session did not answer its completed-session follow-up");

    const outputPath = join(dirname(parentLog), basename(parentLog, extname(parentLog)), `${agentId}.md`);
    const output = await readFile(outputPath, "utf8");
    for (const marker of ["TASK_COMPLETION_6d13", "RUNNING_INSTRUCTION_6d13", repository]) {
      assert.ok(output.includes(marker), `Task result artifact omitted ${marker}`);
    }
    assert.ok(!output.includes("POST_COMPLETION_REPLY_6d13"), "Task result artifact changed after completed-session follow-up");

    console.log(JSON.stringify({
      ompVersion,
      agentId,
      jobId,
      parentSession: parentName,
      childCwd: child.header.cwd,
      liveObservation: "proc:// job status recorded",
      wait: calls.some((call) => call.name === "wait") ? "used without IDs" : "not needed; result auto-delivered",
      runningMessage: "received in child transcript",
      completedFollowUp: "history reply received; Task artifact unchanged",
      taskResultArtifact: "validated; temporary session removed",
      parentRepository: "unchanged",
    }, null, 2));

    succeeded = true;
  } finally {
    if (succeeded) await rm(temporaryRoot, { recursive: true, force: true });
    else console.error(`OMP Task semantic smoke artifacts retained at ${temporaryRoot}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
