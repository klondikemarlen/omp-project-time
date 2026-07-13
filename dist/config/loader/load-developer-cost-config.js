import { pluginsLockfilePath } from "../plugins-lockfile-path.js";
import { projectPluginOverridesPath } from "../project-plugin-overrides-path.js";
import { loadDeveloperCostConfigFromFiles } from "./load-developer-cost-config-from-files.js";

export function loadDeveloperCostConfig(cwd) {
  const pluginsLockfile = pluginsLockfilePath();
  const projectPluginOverrides = projectPluginOverridesPath(cwd);
  return loadDeveloperCostConfigFromFiles(
    pluginsLockfile,
    projectPluginOverrides,
  );
}
