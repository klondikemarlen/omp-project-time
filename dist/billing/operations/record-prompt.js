import { MS_PER_MINUTE } from "../../billing/calculation/time-constants.js";
import { settleDeveloperCostState } from "../../billing/operations/settle-state.js";

export function recordDeveloperPrompt(state, promptAtMs, config) {
  const nextState = settleDeveloperCostState(state, promptAtMs, config);
  const windowMs = config.activeWindowMinutes * MS_PER_MINUTE;
  if (
    nextState.activeStartAtMs === undefined ||
    nextState.activeUntilMs === undefined
  ) {
    nextState.activeStartAtMs = promptAtMs;
    nextState.lastSettledAtMs = promptAtMs;
    nextState.activeUntilMs = promptAtMs + windowMs;
  } else {
    nextState.activeUntilMs = Math.max(
      nextState.activeUntilMs,
      promptAtMs + windowMs,
    );
  }
  nextState.promptCount += 1;
  nextState.lastPromptAtMs = promptAtMs;
  return nextState;
}

export default recordDeveloperPrompt;
