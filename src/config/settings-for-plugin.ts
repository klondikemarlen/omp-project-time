import type { PluginSettingsByName } from "./plugin-settings-by-name.js"

type PluginConfigWithSettings = {
  settings?: PluginSettingsByName
}

export function settingsForPlugin(
  config: PluginConfigWithSettings | undefined,
  pluginName: string,
): Record<string, unknown> {
  return config?.settings?.[pluginName] ?? {}
}
