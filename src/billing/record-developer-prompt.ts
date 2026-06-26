import { activeWindowMs } from "./active-window-ms.js"
import type { DeveloperCostConfig } from "./developer-cost-config.js"
import type { DeveloperCostState } from "./developer-cost-state.js"
import { settleDeveloperCostState } from "./settle-developer-cost-state.js"

export function recordDeveloperPrompt(
  state: DeveloperCostState,
  promptAtMs: number,
  config: DeveloperCostConfig,
): DeveloperCostState {
  const nextState = settleDeveloperCostState(state, promptAtMs, config)
  const windowMs = activeWindowMs(config)

  if (nextState.activeStartAtMs === undefined || nextState.activeUntilMs === undefined) {
    nextState.activeStartAtMs = promptAtMs
    nextState.lastSettledAtMs = promptAtMs
    nextState.activeUntilMs = promptAtMs + windowMs
  } else {
    nextState.activeUntilMs = Math.max(nextState.activeUntilMs, promptAtMs + windowMs)
  }

  nextState.lastPromptAtMs = promptAtMs

  return nextState
}
