import assert from "node:assert/strict";
import test from "node:test";

import { resolveSkillReference } from "./skill-references.mjs";

const files = new Set([
  "principle-model-the-domain/SKILL.md",
  "architect/SKILL.md",
  "architect/references/design-red-flags.md",
  "figure-it-out/SKILL.md",
]);

test("resolves skill roots and files under their actual skill names", () => {
  assert.equal(
    resolveSkillReference("skill://principle-model-the-domain", files),
    "principle-model-the-domain/SKILL.md",
  );
  assert.equal(
    resolveSkillReference("skill://architect/references/design-red-flags.md", files),
    "architect/references/design-red-flags.md",
  );
  assert.equal(
    resolveSkillReference("skill://figure-it-out", files),
    "figure-it-out/SKILL.md",
  );
});

test("rejects missing skill files and paths that escape the skill root", () => {
  assert.equal(
    resolveSkillReference("skill://poteto-mode/references/design-red-flags.md", files),
    null,
  );
  assert.equal(resolveSkillReference("skill://architect/../README.md", files), null);
  assert.equal(resolveSkillReference("skill://missing-skill", files), null);
});
