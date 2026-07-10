import { parseDeveloperCostConfig, } from "../../billing/index.js";
import { LEGACY_PLUGIN_NAME, PLUGIN_NAME } from "../plugin-name.js";
import { readDeveloperCostConfigFile } from "./read-developer-cost-config-file.js";
import { settingsForPlugin } from "../settings-for-plugin.js";
export async function loadDeveloperCostConfigFromFiles(pluginsLockfile, projectPluginOverrides) {
    const [runtimeConfig, projectOverrides] = await Promise.all([
        readDeveloperCostConfigFile(pluginsLockfile),
        readDeveloperCostConfigFile(projectPluginOverrides),
    ]);
    const legacyGlobalSettings = settingsForPlugin(runtimeConfig, LEGACY_PLUGIN_NAME);
    const globalSettings = settingsForPlugin(runtimeConfig, PLUGIN_NAME);
    const legacyProjectSettings = settingsForPlugin(projectOverrides, LEGACY_PLUGIN_NAME);
    const projectSettings = settingsForPlugin(projectOverrides, PLUGIN_NAME);
    const mergedSettings = {
        ...legacyGlobalSettings,
        ...globalSettings,
        ...legacyProjectSettings,
        ...projectSettings,
    };
    return parseDeveloperCostConfig(mergedSettings);
}
