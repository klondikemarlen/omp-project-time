import { pluginsLockfilePath } from "../../config/plugins-lockfile-path.js";
import { projectPluginOverridesPath } from "../../config/project-plugin-overrides-path.js";
import { loadDeveloperCostConfigFromFiles } from "../../config/loader/load-developer-cost-config-from-files.js";

export function loadDeveloperCostConfig(cwd) {
  const pluginsLockfile = pluginsLockfilePath();
  const projectPluginOverrides = projectPluginOverridesPath(cwd);
  return loadDeveloperCostConfigFromFiles(
    pluginsLockfile,
    projectPluginOverrides,
  );
}

export default loadDeveloperCostConfig;
