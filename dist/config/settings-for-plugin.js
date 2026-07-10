export function settingsForPlugin(config, pluginName) {
    return config?.settings?.[pluginName] ?? {};
}
