export function sanitizedProjectLabel(value: string): string {
  const project = value.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "")
  return project === "" ? "local-repository" : project
}

export default sanitizedProjectLabel
