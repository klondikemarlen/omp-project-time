import {
  PROJECT_TIME_STATE_ENTRY,
  loadPersistedProjectTimeState,
} from "../../extension/session-state.js";
import {
  recordProjectTimePrompt,
  serializeProjectTimeState,
  settleProjectTimeState,
} from "../../time-log/domain/state.js";

export class SessionStateCoordinator {
  timeLogRecorder;

  appendEntry;

  states = new Map();

  constructor(timeLogRecorder, appendEntry) {
    this.timeLogRecorder = timeLogRecorder;
    this.appendEntry = appendEntry;
  }

  stateFor(sessionId, entries) {
    return this.states.get(sessionId) ?? loadPersistedProjectTimeState(entries);
  }

  async recordPrompt(update) {
    const stateBeforePrompt = {
      ...this.stateFor(update.sessionId, update.entries),
    };
    const state = recordProjectTimePrompt(
      stateBeforePrompt,
      update.nowMs,
      update.config,
    );
    this.recordTimeLogSettlement(update, stateBeforePrompt, state);
    this.timeLogRecorder.recordPromptStart(
      update.sessionId,
      update.cwd,
      update.nowMs,
      update.config,
      update.notifyTimeLogError,
    );
    this.persist(update.sessionId, state);
    return state;
  }

  async settle(update) {
    const stateBeforeSettlement = {
      ...this.stateFor(update.sessionId, update.entries),
    };
    const state = settleProjectTimeState(stateBeforeSettlement, update.nowMs);
    this.recordTimeLogSettlement(update, stateBeforeSettlement, state);
    this.persist(update.sessionId, state);
    return state;
  }

  async flush(sessionId, notifyTimeLogError) {
    await this.timeLogRecorder.flush(sessionId, notifyTimeLogError);
    this.states.delete(sessionId);
  }

  persist(sessionId, state) {
    this.states.set(sessionId, state);
    this.appendEntry(
      PROJECT_TIME_STATE_ENTRY,
      serializeProjectTimeState(state),
    );
  }

  recordTimeLogSettlement(update, stateBeforeSettlement, settledState) {
    this.timeLogRecorder.recordSettlement(
      {
        config: update.config,
        cwd: update.cwd,
        nowMs: update.nowMs,
        sessionId: update.sessionId,
        stateBeforeSettlement,
        settledState,
      },
      update.notifyTimeLogError,
    );
  }
}
