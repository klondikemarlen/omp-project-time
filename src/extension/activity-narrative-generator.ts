import type { ExtensionContext } from "@/extension/types.js"
import {
  parseActivityNarrative,
  type ActivityNarrative,
} from "@/time-log/domain/narrative.js"

type NarrativeCompletionResponse = {
  stopReason: string
  content: Array<{ type: string; text?: string }>
}

export type ActivityNarrativeCompletion = (
  model: NonNullable<ExtensionContext["model"]>,
  request: {
    systemPrompt: string[]
    messages: Array<{ role: "user"; content: string; timestamp: number }>
  },
  options: {
    apiKey: unknown
    maxTokens: number
    disableReasoning: boolean
  },
) => Promise<NarrativeCompletionResponse>

const activityNarrativePrompt = [
  "Generate a detailed Project Time worklog narrative for the current user request.",
  "Return a factual narrative up to 2,000 characters with all salient requested work.",
  "Use plain text and retain relevant work-item identifiers, titles, components, and files; do not invent missing context.",
  "Never include credentials or personal data.",
].join(" ")

export async function generateActivityNarrative(
  prompt: string,
  ctx: ExtensionContext,
  complete?: ActivityNarrativeCompletion,
): Promise<ActivityNarrative | undefined> {
  if (ctx.modelRegistry === undefined || ctx.model === undefined) return undefined

  const sessionId = ctx.sessionManager.getSessionId()
  const apiKey = await ctx.modelRegistry.getApiKey(ctx.model, sessionId)
  if (!apiKey) return undefined

  // OMP's Bun runtime loads pi-ai source modules; Node test workers do not load its Markdown imports.
  const completion = complete ?? (await import("@oh-my-pi/pi-ai")).completeSimple as unknown as ActivityNarrativeCompletion
  const response = await completion(
    ctx.model,
    {
      systemPrompt: [activityNarrativePrompt],
      messages: [{ role: "user", content: prompt, timestamp: Date.now() }],
    },
    {
      apiKey: ctx.modelRegistry.resolver(ctx.model, sessionId),
      maxTokens: 1_500,
      disableReasoning: true,
    },
  )
  if (response.stopReason === "error") return undefined

  let text = ""
  for (const content of response.content) {
    if (content.type === "text") text += content.text ?? ""
  }
  return parseActivityNarrative({ text, source: "generated" })
}
