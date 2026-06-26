import {
  parseDeveloperCostConfig,
  type DeveloperCostConfig,
  type DeveloperCostOptions,
} from "./billing/index.js"
import { PLUGIN_NAME } from "./config/plugin-name.js"
import type { PluginRuntimeConfig } from "./config/plugin-runtime-config.js"
import type { ProjectPluginOverrides } from "./config/project-plugin-overrides.js"
import { readDeveloperCostConfigFile } from "./config/read-developer-cost-config-file.js"
import { settingsForPlugin } from "./config/settings-for-plugin.js"

export async function loadDeveloperCostConfigFromFiles(
  pluginsLockfile: string,
  projectPluginOverrides: string,
): Promise<DeveloperCostConfig> {
  const [runtimeConfig, projectOverrides] = await Promise.all([
    readDeveloperCostConfigFile<PluginRuntimeConfig>(pluginsLockfile),
    readDeveloperCostConfigFile<ProjectPluginOverrides>(projectPluginOverrides),
  ])
  const globalSettings = settingsForPlugin(runtimeConfig, PLUGIN_NAME)
  const projectSettings = settingsForPlugin(projectOverrides, PLUGIN_NAME)
  const mergedSettings: DeveloperCostOptions = {
    ...globalSettings,
    ...projectSettings,
  }

  return parseDeveloperCostConfig(mergedSettings)
}
