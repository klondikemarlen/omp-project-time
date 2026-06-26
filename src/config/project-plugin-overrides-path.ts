import path from "node:path"

export function projectPluginOverridesPath(cwd: string): string {
  return path.join(cwd, ".omp", "plugin-overrides.json")
}
