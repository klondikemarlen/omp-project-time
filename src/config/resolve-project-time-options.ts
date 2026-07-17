import { PLUGIN_NAME } from "@/config/plugin-name.js"
import type { PluginConfig } from "@/config/parse-plugin-config.js"
import { settingsForPlugin } from "@/config/settings-for-plugin.js"
import type { ProjectTimeOptions } from "@/config/project-time-config.js"

export function resolveProjectTimeOptions(
  globalConfig: PluginConfig | undefined,
  projectConfig: PluginConfig | undefined,
): ProjectTimeOptions {
  return {
    ...settingsForPlugin(globalConfig, PLUGIN_NAME),
    ...settingsForPlugin(projectConfig, PLUGIN_NAME),
  }
}

export default resolveProjectTimeOptions
