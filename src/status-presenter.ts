import {
  displayedDeveloperCost,
  formatDeveloperCost,
  type DeveloperCostConfig,
  type DeveloperCostState,
} from "./billing/index.js"
import type { ExtensionContext } from "./extension-types.js"

export const STATUS_KEY = "developer-cost-status"

export function updateStatus(
  ctx: ExtensionContext,
  state: DeveloperCostState,
  config: DeveloperCostConfig,
): void {
  ctx.ui.setStatus(
    STATUS_KEY,
    ctx.ui.theme.fg("dim", statusText(state, config)),
  )
}

export function clearStatus(ctx: ExtensionContext): void {
  ctx.ui.setStatus(STATUS_KEY, undefined)
}

export function statusText(state: DeveloperCostState, config: DeveloperCostConfig): string {
  const text = formatDeveloperCost(displayedDeveloperCost(state))

  return `${text} (${config.label})`
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message

  return String(error)
}
