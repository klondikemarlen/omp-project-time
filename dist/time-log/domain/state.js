import { MS_PER_MINUTE } from "../../utils/time-constants.js";
import { parseOptionalNumber } from "../../utils/parse-optional-number.js";

export function emptyProjectTimeState() {
  return { promptCount: 0, activeMilliseconds: 0 };
}

export function parseProjectTimeState(value) {
  if (typeof value !== "object" || value === null) return undefined;
  const candidate = value;
  const promptCount = parseOptionalNumber(candidate.promptCount) ?? 0;
  const activeMilliseconds =
    parseOptionalNumber(candidate.activeMilliseconds) ?? 0;
  const activeStartAtMs = parseOptionalNumber(candidate.activeStartAtMs);
  const activeUntilMs = parseOptionalNumber(candidate.activeUntilMs);
  const lastSettledAtMs = parseOptionalNumber(candidate.lastSettledAtMs);
  const lastPromptAtMs = parseOptionalNumber(candidate.lastPromptAtMs);
  return {
    promptCount,
    activeMilliseconds,
    ...(activeStartAtMs === undefined ? {} : { activeStartAtMs }),
    ...(activeUntilMs === undefined ? {} : { activeUntilMs }),
    ...(lastSettledAtMs === undefined ? {} : { lastSettledAtMs }),
    ...(lastPromptAtMs === undefined ? {} : { lastPromptAtMs }),
  };
}

export function serializeProjectTimeState(state) {
  return { ...state };
}

export function recordProjectTimePrompt(state, promptAtMs, config) {
  const nextState = settleProjectTimeState(state, promptAtMs);
  const windowMs = config.activeWindowMinutes * MS_PER_MINUTE;
  if (
    nextState.activeStartAtMs === undefined ||
    nextState.activeUntilMs === undefined
  ) {
    nextState.activeStartAtMs = promptAtMs;
    nextState.activeUntilMs = promptAtMs + windowMs;
    nextState.lastSettledAtMs = promptAtMs;
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

export function settleProjectTimeState(state, nowMs) {
  const nextState = { ...state };
  if (
    nextState.activeStartAtMs === undefined ||
    nextState.activeUntilMs === undefined
  ) {
    return nextState;
  }
  const settleFromMs = nextState.lastSettledAtMs ?? nextState.activeStartAtMs;
  const settleUntilMs = Math.min(nowMs, nextState.activeUntilMs);
  if (settleUntilMs > settleFromMs) {
    nextState.activeMilliseconds += settleUntilMs - settleFromMs;
    nextState.lastSettledAtMs = settleUntilMs;
  }
  if (nowMs < nextState.activeUntilMs) return nextState;
  delete nextState.activeStartAtMs;
  delete nextState.activeUntilMs;
  delete nextState.lastSettledAtMs;
  return nextState;
}
