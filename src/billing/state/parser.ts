import { parseDecimalString } from "../../utils/parse-decimal-string.js"
import { parseOptionalNumber } from "../../utils/parse-optional-number.js"
import type { DeveloperCostState } from "./model.js"

export function parseDeveloperCostState(value: unknown): DeveloperCostState | undefined {
  if (typeof value !== "object" || value === null) return undefined

  const candidate = value as Record<string, unknown>
  const totalCost = parseDecimalString(candidate.totalCost)
  if (totalCost === undefined) return undefined

  const rawActiveStartAtMs = candidate.activeStartAtMs
  const rawActiveUntilMs = candidate.activeUntilMs
  const rawLastSettledAtMs = candidate.lastSettledAtMs
  const rawLastPromptAtMs = candidate.lastPromptAtMs
  const rawPromptCount = candidate.promptCount ?? 0
  const rawActiveMilliseconds = candidate.activeMilliseconds ?? 0
  const activeStartAtMs = parseOptionalNumber(rawActiveStartAtMs)
  const activeUntilMs = parseOptionalNumber(rawActiveUntilMs)
  const lastSettledAtMs = parseOptionalNumber(rawLastSettledAtMs)
  const lastPromptAtMs = parseOptionalNumber(rawLastPromptAtMs)
  const promptCount = parseOptionalNumber(rawPromptCount) ?? 0
  const activeMilliseconds = parseOptionalNumber(rawActiveMilliseconds) ?? 0

  return {
    totalCost,
    promptCount,
    activeMilliseconds,
    activeStartAtMs,
    activeUntilMs,
    lastSettledAtMs,
    lastPromptAtMs,
  }
}
