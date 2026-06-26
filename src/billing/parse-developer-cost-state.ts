import { parseDecimalString } from "../utils/parse-decimal-string.js"
import { parseOptionalNumber } from "../utils/parse-optional-number.js"
import type { DeveloperCostState } from "./developer-cost-state.js"

export function parseDeveloperCostState(value: unknown): DeveloperCostState | undefined {
  if (typeof value !== "object" || value === null) return undefined

  const candidate = value as Record<string, unknown>
  const totalCost = parseDecimalString(candidate.totalCost)
  if (totalCost === undefined) return undefined

  const activeStartAtMs = parseOptionalNumber(candidate.activeStartAtMs)
  const activeUntilMs = parseOptionalNumber(candidate.activeUntilMs)
  const lastSettledAtMs = parseOptionalNumber(candidate.lastSettledAtMs)
  const lastPromptAtMs = parseOptionalNumber(candidate.lastPromptAtMs)

  return {
    totalCost,
    activeStartAtMs,
    activeUntilMs,
    lastSettledAtMs,
    lastPromptAtMs,
  }
}
