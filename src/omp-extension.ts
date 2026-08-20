import { generateActivity } from "@/extension/activity-label-generator.js"
import { projectTimeExtension } from "@/index.js"
import type { ExtensionApi, ExtensionOptions } from "@/extension/types.js"

export function ompProjectTimeExtension(
  pi: ExtensionApi,
  options: ExtensionOptions = {},
): void {
  projectTimeExtension(pi, {
    ...options,
    generateActivity:
      options.generateActivity ??
      ((prompt, ctx, activityContext) =>
        generateActivity(prompt, ctx, activityContext)),
  })
}

export default ompProjectTimeExtension
