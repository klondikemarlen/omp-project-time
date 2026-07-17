import type { ProjectTimeConfig } from "@/config/project-time-config.js"
import { pluginsLockfilePath } from "@/config/plugins-lockfile-path.js"
import { projectPluginOverridesPath } from "@/config/project-plugin-overrides-path.js"
import { loadProjectTimeConfigFromFiles } from "./load-project-time-config-from-files.js"
export function loadProjectTimeConfig(cwd: string): Promise<ProjectTimeConfig> {
  const pluginsLockfile = pluginsLockfilePath()
  const projectPluginOverrides = projectPluginOverridesPath(cwd)

  return loadProjectTimeConfigFromFiles(pluginsLockfile, projectPluginOverrides)
}

export default loadProjectTimeConfig
