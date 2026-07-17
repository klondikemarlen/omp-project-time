import {
  emptyProjectTimeState,
  parseProjectTimeState,
  serializeProjectTimeState,
} from "../time-log/domain/state.js";

export const PROJECT_TIME_STATE_ENTRY = "project-time.state";
export function loadPersistedProjectTimeState(entries) {
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];
    if (entry.type !== "custom") continue;
    if (entry.customType !== PROJECT_TIME_STATE_ENTRY) continue;
    const state = parseProjectTimeState(entry.data);
    if (state !== undefined) return state;
  }
  return emptyProjectTimeState();
}

export {
  emptyProjectTimeState,
  parseProjectTimeState,
  serializeProjectTimeState,
};
export default loadPersistedProjectTimeState;
