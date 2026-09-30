export function resolveSkillReference(uri, files) {
  const match = /^skill:\/\/([A-Za-z0-9._-]+)(?:\/(.*))?$/u.exec(uri);
  if (!match) return null;

  const skill = match[1];
  const target = match[2] || "SKILL.md";
  const segments = target.split("/");
  if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) {
    return null;
  }

  const path = `${skill}/${target}`;
  return files.has(path) ? path : null;
}
