import { descriptionInputFromSession } from "@/billable-time/domain/description-context.js"
import type { BillableDescription } from "@/billable-time/domain/description.js"

export type BillableDescriptionContext = {
  sessionId: string
  generateTitle?: (input: string) => Promise<string | null>
}

type SessionHeader = {
  title?: unknown
  titleSource?: unknown
}

type SessionEntry = Parameters<typeof descriptionInputFromSession>[0][number]

export async function describeBillableSession(
  header: SessionHeader | null,
  entries: readonly SessionEntry[],
  context: BillableDescriptionContext,
  currentSummary?: unknown,
): Promise<Omit<BillableDescription, "sessionId" | "recordedAtMs">> {
  const explicitDescription = explicitTitle(header)
  if (explicitDescription !== undefined) return { description: explicitDescription, source: "explicit" }

  const input = descriptionInputFromSession(entries, currentSummary)
  const generatedDescription = await generateDescription(input, context)

  return { description: generatedDescription, source: "generated" }
}

function explicitTitle(header: SessionHeader | null): string | undefined {
  if (header?.titleSource !== "user") return undefined

  return normalizeDescription(header.title)
}

async function generateDescription(input: string, context: BillableDescriptionContext): Promise<string> {
  if (input === "") return "Unlabeled billable work"

  if (context.generateTitle === undefined) return "Unlabeled billable work"

  return normalizeDescription(await context.generateTitle(input)) ?? "Unlabeled billable work"
}

function normalizeDescription(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined

  const description = value.replace(/\s+/g, " ").trim().slice(0, 160)
  return description === "" ? undefined : description
}
