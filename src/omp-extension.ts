import { generateSessionTitle } from "@oh-my-pi/pi-coding-agent/utils/title-generator"

import { generateActivity } from "@/extension/activity-label-generator.js"
import projectTimeExtension from "@/index.js"
import type { ExtensionApi, ExtensionOptions } from "@/extension/types.js"

export default function ompProjectTimeExtension(
  pi: ExtensionApi,
  options: ExtensionOptions = {},
): void {
  projectTimeExtension(pi, {
    ...options,
    generateActivity: (prompt, ctx) => generateActivity(
      prompt,
      ctx,
      pi.pi?.settings,
      generateSessionTitle,
    ),
  })
}
