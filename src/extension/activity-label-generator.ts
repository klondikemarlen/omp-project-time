import { resolveActivityCompletionContext } from "@/extension/activity-completion.js"
import { generateActivityNarrative } from "@/extension/activity-narrative-generator.js"
import { parseGeneratedActivityLabel } from "@/time-log/domain/activity.js"
import type { ActivityNarrative } from "@/time-log/domain/narrative.js"
import type {
  ActivityGenerationContext,
  GeneratedActivity,
  ExtensionContext,
} from "@/extension/types.js"

function activityLabelPrompt(context: ActivityGenerationContext): string {
  const repository = context.repositoryIdentity ?? "a local repository"
  return [
    "Generate a concise coarse activity label for the current user request.",
    `The evidence is recorded for project ${context.project} in ${repository}.`,
    `Return exactly ${context.project} | label, using that project name verbatim.`,
    "Describe requested work in that repository, never OMP, Git, Project Time, commits, or generic process status.",
    "Use NONE as the label when the request has no concrete repository-relevant task.",
    "The label must contain 1 to 48 Unicode letters or numbers, with words separated by one space or hyphen.",
    "Do not use punctuation, markdown, quotes, file paths, IDs, personal data, credentials, or explanations.",
  ].join(" ")
}

type ActivityLabelGenerator = (
  prompt: string,
  ctx: ExtensionContext,
  activityContext: ActivityGenerationContext,
) => Promise<string | undefined>

type ActivityNarrativeGenerator = (
  prompt: string,
  ctx: ExtensionContext,
) => Promise<ActivityNarrative | undefined>

export async function generateActivity(
  prompt: string,
  ctx: ExtensionContext,
  activityContext: ActivityGenerationContext | undefined,
  labelGenerator: ActivityLabelGenerator = generateActivityLabel,
  narrativeGenerator: ActivityNarrativeGenerator = generateActivityNarrative,
): Promise<GeneratedActivity> {
  if (ctx.modelRegistry === undefined || activityContext === undefined)
    return {}

  const [labelResult, narrativeResult] = await Promise.allSettled([
    labelGenerator(prompt, ctx, activityContext),
    narrativeGenerator(prompt, ctx),
  ])
  const label =
    labelResult.status === "fulfilled"
      ? parseRepositoryActivityLabel(labelResult.value, activityContext)
      : undefined
  const narrative =
    narrativeResult.status === "fulfilled" ? narrativeResult.value : undefined

  return {
    ...(label === undefined ? {} : { activity: label }),
    ...(narrative === undefined ? {} : { narrative }),
  }
}

function parseRepositoryActivityLabel(
  value: unknown,
  context: ActivityGenerationContext,
): string | undefined {
  if (typeof value !== "string") return undefined

  const [project, label, ...remainder] = value.split("|")
  if (
    remainder.length !== 0 ||
    project?.trim() !== context.project ||
    label === undefined
  ) {
    return undefined
  }

  return parseGeneratedActivityLabel(label)
}

async function generateActivityLabel(
  prompt: string,
  ctx: ExtensionContext,
  activityContext: ActivityGenerationContext,
): Promise<string | undefined> {
  const completionContext = await resolveActivityCompletionContext(ctx)
  if (completionContext === undefined) return undefined

  const completion = (await import("@oh-my-pi/pi-ai")).completeSimple
  const response = await completion(
    completionContext.model,
    {
      systemPrompt: [activityLabelPrompt(activityContext)],
      messages: [{ role: "user", content: prompt, timestamp: Date.now() }],
    },
    {
      apiKey: completionContext.apiKey,
      maxTokens: 64,
      disableReasoning: true,
    },
  )

  if (response.stopReason === "error") return undefined

  let text = ""
  for (const content of response.content) {
    if (content.type === "text") text += content.text ?? ""
  }
  return text
}
