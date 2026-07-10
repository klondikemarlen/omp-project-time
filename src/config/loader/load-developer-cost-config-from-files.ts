import {
  parseDeveloperCostConfig,
  type DeveloperCostConfig,
  type DeveloperCostOptions,
} from "../../billing/index.js"
import { LEGACY_PLUGIN_NAME, PLUGIN_NAME } from "../plugin-name.js"
import type { PluginRuntimeConfig } from "../plugin-runtime-config.js"
import type { ProjectPluginOverrides } from "../project-plugin-overrides.js"
import { readDeveloperCostConfigFile } from "./read-developer-cost-config-file.js"
import { settingsForPlugin } from "../settings-for-plugin.js"

export async function loadDeveloperCostConfigFromFiles(
  pluginsLockfile: string,
  projectPluginOverrides: string,
): Promise<DeveloperCostConfig> {
  const [runtimeConfig, projectOverrides] = await Promise.all([
    readDeveloperCostConfigFile<PluginRuntimeConfig>(pluginsLockfile),
    readDeveloperCostConfigFile<ProjectPluginOverrides>(projectPluginOverrides),
  ])
  const legacyGlobalSettings = settingsForPlugin(runtimeConfig, LEGACY_PLUGIN_NAME)
  const globalSettings = settingsForPlugin(runtimeConfig, PLUGIN_NAME)
  const legacyProjectSettings = settingsForPlugin(projectOverrides, LEGACY_PLUGIN_NAME)
  const projectSettings = settingsForPlugin(projectOverrides, PLUGIN_NAME)
  const mergedSettings: DeveloperCostOptions = {
    ...legacyGlobalSettings,
    ...globalSettings,
    ...legacyProjectSettings,
    ...projectSettings,
  }

  return parseDeveloperCostConfig(mergedSettings)
}
