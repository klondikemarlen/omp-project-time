import { activeWindowMs } from "../calculation/active-window.js"
import type { DeveloperCostConfig } from "../config/model.js"
import type { DeveloperCostState } from "../state/model.js"
import { settleDeveloperCostState } from "./settle-state.js"

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

  nextState.promptCount += 1
  nextState.lastPromptAtMs = promptAtMs

  return nextState
}
