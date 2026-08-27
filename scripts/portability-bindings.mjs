export const forbiddenRuntimeBindings = [
  ".cursor/",
  "subagent_type:",
  "AskQuestion",
  "environment: \"cloud\"",
  "claude-fable-5-thinking-max",
  "gpt-5.6-sol-max",
  "grok-4.6-fast-xhigh",
  "claude-opus-5-thinking-xhigh",
  "skill://",
  "~/.agents/skills",
  "writing-for-agents",
  "cua-driver",
  "peekaboo",
  "update_state",
  "SendToUser",
  "api2.cursor.sh",
  "secret-request",
];

export function forbiddenBindingsIn(source) {
  return forbiddenRuntimeBindings.filter((binding) => source.includes(binding));
}

export function isAllowedRuntimeBinding(path, binding) {
  return path === "skills/create-skill/SKILL.md" && binding === "~/.agents/skills";
}
