import type { SessionEntryLike } from "@/extension/types.js"
import {
  emptyProjectTimeState,
  parseProjectTimeState,
  serializeProjectTimeState,
  type ProjectTimeState,
} from "@/time-log/domain/state.js"

export const PROJECT_TIME_STATE_ENTRY = "project-time.state"

type PersistedSessionEntryLike = SessionEntryLike & {
  type?: unknown
  customType?: unknown
  data?: unknown
}

export function loadPersistedProjectTimeState(
  entries: readonly PersistedSessionEntryLike[],
): ProjectTimeState {
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index]
    if (entry.type !== "custom") continue
    if (entry.customType !== PROJECT_TIME_STATE_ENTRY) continue

    const state = parseProjectTimeState(entry.data)
    if (state !== undefined) return state
  }

  return emptyProjectTimeState()
}

export { emptyProjectTimeState, parseProjectTimeState, serializeProjectTimeState }
export type { ProjectTimeState }

export default loadPersistedProjectTimeState
