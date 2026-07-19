import { generateSessionTitle } from "@oh-my-pi/pi-coding-agent/utils/title-generator"

import type { ExtensionApi, ExtensionContext } from "@/extension/types.js"

const activityLabelPrompt = [
  "Generate a concise coarse Project Time activity label for the current user request.",
  "Return only 1 to 48 Unicode letters or numbers, with words separated by a single space or hyphen.",
  "Do not use punctuation, markdown, quotes, file paths, IDs, personal data, credentials, or explanations.",
  "Describe the requested work neutrally and broadly.",
].join(" ")

export async function generateActivityLabel(
  prompt: string,
  ctx: ExtensionContext,
  pi: ExtensionApi,
): Promise<string | undefined> {
  const settings = pi.pi?.settings
  if (ctx.modelRegistry === undefined || settings === undefined) {
    return undefined
  }

  return (await generateSessionTitle(
    prompt,
    ctx.modelRegistry,
    settings,
    ctx.sessionManager.getSessionId(),
    ctx.model,
    undefined,
    activityLabelPrompt,
  )) ?? undefined
}
