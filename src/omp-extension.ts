import { generateActivityLabel } from "@/extension/activity-label-generator.js"
import projectTimeExtension from "@/index.js"
import type { ExtensionApi, ExtensionOptions } from "@/extension/types.js"

export default function ompProjectTimeExtension(
  pi: ExtensionApi,
  options: ExtensionOptions = {},
): void {
  projectTimeExtension(pi, {
    ...options,
    generateActivity: (prompt, ctx) => generateActivityLabel(prompt, ctx, pi),
  })
}
