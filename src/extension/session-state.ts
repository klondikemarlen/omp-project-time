import {
  emptyDeveloperCostState,
  parseDeveloperCostState,
  type DeveloperCostState,
} from "../billing/index.js"

export const DEVELOPER_COST_STATE_ENTRY = "developer-cost-status.state"

type SessionEntryLike = {
  type?: unknown
  customType?: unknown
  data?: unknown
}

export function loadPersistedDeveloperCostState(
  entries: readonly SessionEntryLike[],
): DeveloperCostState {
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index]
    if (entry.type !== "custom") continue
    if (entry.customType !== DEVELOPER_COST_STATE_ENTRY) continue

    const state = parseDeveloperCostState(entry.data)
    if (state !== undefined) return state
  }

  return emptyDeveloperCostState()
}
