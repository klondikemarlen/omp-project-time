import { PLUGIN_NAME } from "../config/plugin-name.js";
import { settingsForPlugin } from "../config/settings-for-plugin.js";

export function resolveProjectTimeOptions(globalConfig, projectConfig) {
  return {
    ...settingsForPlugin(globalConfig, PLUGIN_NAME),
    ...settingsForPlugin(projectConfig, PLUGIN_NAME),
  };
}

export default resolveProjectTimeOptions;
