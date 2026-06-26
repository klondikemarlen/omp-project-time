import { loadDeveloperCostConfigFromFiles } from "./load-developer-cost-config-from-files.js"
import { DeveloperCostStatusRuntime } from "./developer-cost-status-runtime.js"
import type { ExtensionApi, ExtensionOptions } from "./extension-types.js"

export { loadDeveloperCostConfigFromFiles }
export type { ExtensionApi, ExtensionOptions }

export default function developerCostStatusExtension(
  pi: ExtensionApi,
  options: ExtensionOptions = {},
): void {
  const runtime = new DeveloperCostStatusRuntime(pi, options)

  runtime.register()
}
