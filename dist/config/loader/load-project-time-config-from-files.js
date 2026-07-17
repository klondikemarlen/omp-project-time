import { parseProjectTimeConfig } from "../../config/project-time-config.js";
import { parsePluginConfig } from "../../config/parse-plugin-config.js";
import { resolveProjectTimeOptions } from "../../config/resolve-project-time-options.js";
import { readProjectTimeConfigFile } from "./read-project-time-config-file.js";

export async function loadProjectTimeConfigFromFiles(
  pluginsLockfile,
  projectPluginOverrides,
) {
  const [rawGlobalConfig, rawProjectConfig] = await Promise.all([
    readProjectTimeConfigFile(pluginsLockfile),
    readProjectTimeConfigFile(projectPluginOverrides),
  ]);
  return parseProjectTimeConfig(
    resolveProjectTimeOptions(
      parsePluginConfig(rawGlobalConfig),
      parsePluginConfig(rawProjectConfig),
    ),
  );
}

export default loadProjectTimeConfigFromFiles;
