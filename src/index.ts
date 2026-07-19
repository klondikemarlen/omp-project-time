import { loadProjectTimeConfig } from "@/config/loader/load-project-time-config.js"
import { loadProjectTimeConfigFromFiles } from "@/config/loader/load-project-time-config-from-files.js"
import { ProjectTimeRuntime } from "@/extension/runtime.js"
import type { ExtensionApi, ExtensionOptions } from "@/extension/types.js"

export { loadProjectTimeConfig, loadProjectTimeConfigFromFiles }
export type { ExtensionApi, ExtensionOptions }
export type { ProjectTimeConfig } from "@/config/project-time-config.js"
export default function projectTimeExtension(
  pi: ExtensionApi,
  options: ExtensionOptions = {},
): void {
  const runtime = new ProjectTimeRuntime(pi, options)

  runtime.register()
}
