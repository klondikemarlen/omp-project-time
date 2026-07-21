import type { generateSessionTitle } from "@oh-my-pi/pi-coding-agent/utils/title-generator"

import { generateActivityNarrative } from "@/extension/activity-narrative-generator.js"
import type { GeneratedActivity } from "@/extension/types.js"
import { parseGeneratedActivityLabel } from "@/time-log/domain/activity.js"
import type { ActivityNarrative } from "@/time-log/domain/narrative.js"
import type { ExtensionContext } from "@/extension/types.js"

const activityLabelPrompt = [
  "Generate a concise coarse Project Time activity label for the current user request.",
  "Return only 1 to 48 Unicode letters or numbers, with words separated by a single space or hyphen.",
  "Do not use punctuation, markdown, quotes, file paths, IDs, personal data, credentials, or explanations.",
  "Describe the requested work neutrally and broadly.",
].join(" ")

export async function generateActivity(
  prompt: string,
  ctx: ExtensionContext,
  settings: Parameters<typeof generateSessionTitle>[2] | undefined,
  titleGenerator: typeof generateSessionTitle,
  narrativeGenerator: (
    prompt: string,
    ctx: ExtensionContext,
  ) => Promise<ActivityNarrative | undefined> = generateActivityNarrative,
): Promise<GeneratedActivity> {
  if (ctx.modelRegistry === undefined) return {}

  const [labelResult, narrativeResult] = await Promise.allSettled([
    settings === undefined
      ? Promise.resolve(undefined)
      : titleGenerator(
        prompt,
        ctx.modelRegistry,
        settings,
        ctx.sessionManager.getSessionId(),
        ctx.model,
        undefined,
        activityLabelPrompt,
      ),
    narrativeGenerator(prompt, ctx),
  ])
  const label = labelResult.status === "fulfilled"
    ? parseGeneratedActivityLabel(labelResult.value)
    : undefined
  const narrative = narrativeResult.status === "fulfilled"
    ? narrativeResult.value
    : undefined

  return {
    ...(label === undefined ? {} : { activity: label }),
    ...(narrative === undefined ? {} : { narrative }),
  }
}
