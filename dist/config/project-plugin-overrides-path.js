import path from "node:path";
export function projectPluginOverridesPath(cwd) {
    return path.join(cwd, ".omp", "plugin-overrides.json");
}
