import { MS_PER_MINUTE } from "@/utils/time-constants.js"
import { parseActivityLabel } from "@/time-log/domain/activity.js"
import { parseOptionalNumber } from "@/utils/parse-optional-number.js"

export type ProjectTimeState = {
  promptCount: number
  activeMilliseconds: number
  activeStartAtMs?: number
  activeUntilMs?: number
  lastSettledAtMs?: number
  lastPromptAtMs?: number
  activity?: string
  activityStartedAtMs?: number
}

export function emptyProjectTimeState(): ProjectTimeState {
  return { promptCount: 0, activeMilliseconds: 0 }
}

export function parseProjectTimeState(
  value: unknown,
): ProjectTimeState | undefined {
  if (typeof value !== "object" || value === null) return undefined

  const candidate = value as Record<string, unknown>
  const promptCount = parseOptionalNumber(candidate.promptCount) ?? 0
  const activeMilliseconds = parseOptionalNumber(candidate.activeMilliseconds) ?? 0
  const activeStartAtMs = parseOptionalNumber(candidate.activeStartAtMs)
  const activeUntilMs = parseOptionalNumber(candidate.activeUntilMs)
  const lastSettledAtMs = parseOptionalNumber(candidate.lastSettledAtMs)
  const lastPromptAtMs = parseOptionalNumber(candidate.lastPromptAtMs)
  const activity = parseActivityLabel(candidate.activity)
  const activityStartedAtMs = parseOptionalNumber(candidate.activityStartedAtMs)

  return {
    promptCount,
    activeMilliseconds,
    ...(activeStartAtMs === undefined ? {} : { activeStartAtMs }),
    ...(activeUntilMs === undefined ? {} : { activeUntilMs }),
    ...(lastSettledAtMs === undefined ? {} : { lastSettledAtMs }),
    ...(lastPromptAtMs === undefined ? {} : { lastPromptAtMs }),
    ...(activity === undefined ? {} : { activity }),
    ...(activityStartedAtMs === undefined ? {} : { activityStartedAtMs }),
  }
}

export function serializeProjectTimeState(
  state: ProjectTimeState,
): Record<string, unknown> {
  return { ...state }
}

export function recordProjectTimePrompt(
  state: ProjectTimeState,
  promptAtMs: number,
  config: { activeWindowMinutes: number },
): ProjectTimeState {
  const nextState = settleProjectTimeState(state, promptAtMs)
  const windowMs = config.activeWindowMinutes * MS_PER_MINUTE

  if (
    nextState.activeStartAtMs === undefined
    || nextState.activeUntilMs === undefined
  ) {
    nextState.activeStartAtMs = promptAtMs
    nextState.activeUntilMs = promptAtMs + windowMs
    nextState.lastSettledAtMs = promptAtMs
    nextState.activityStartedAtMs = promptAtMs
  } else {
    nextState.activeUntilMs = Math.max(nextState.activeUntilMs, promptAtMs + windowMs)
  }

  nextState.promptCount += 1
  nextState.lastPromptAtMs = promptAtMs

  return nextState
}

export function setProjectTimeActivity(
  state: ProjectTimeState,
  activity: string | undefined,
  nowMs: number,
): ProjectTimeState {
  const nextState = { ...state }

  if (activity === undefined) delete nextState.activity
  else nextState.activity = activity

  if (nextState.activeStartAtMs !== undefined && nextState.activeUntilMs !== undefined) {
    nextState.activityStartedAtMs = nowMs
  } else {
    delete nextState.activityStartedAtMs
  }

  return nextState
}

export function settleProjectTimeState(
  state: ProjectTimeState,
  nowMs: number,
): ProjectTimeState {
  const nextState = { ...state }

  if (
    nextState.activeStartAtMs === undefined
    || nextState.activeUntilMs === undefined
  ) {
    return nextState
  }

  const settleFromMs = nextState.lastSettledAtMs ?? nextState.activeStartAtMs
  const settleUntilMs = Math.min(nowMs, nextState.activeUntilMs)

  if (settleUntilMs > settleFromMs) {
    nextState.activeMilliseconds += settleUntilMs - settleFromMs
    nextState.lastSettledAtMs = settleUntilMs
  }

  if (nowMs < nextState.activeUntilMs) return nextState

  delete nextState.activeStartAtMs
  delete nextState.activeUntilMs
  delete nextState.lastSettledAtMs
  delete nextState.activityStartedAtMs

  return nextState
}
