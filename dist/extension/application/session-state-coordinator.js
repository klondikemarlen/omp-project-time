import { serializeDeveloperCostState } from "../../billing/index.js";
import {
  DEVELOPER_COST_STATE_ENTRY,
  loadPersistedDeveloperCostState,
} from "../../extension/session-state.js";

export class SessionStateCoordinator {
  ledger;

  timeLogRecorder;

  appendEntry;

  states = new Map();

  constructor(ledger, timeLogRecorder, appendEntry) {
    this.ledger = ledger;
    this.timeLogRecorder = timeLogRecorder;
    this.appendEntry = appendEntry;
  }

  stateFor(sessionId, entries) {
    return (
      this.states.get(sessionId) ?? loadPersistedDeveloperCostState(entries)
    );
  }

  async recordPrompt(update) {
    const stateBeforePrompt = {
      ...this.stateFor(update.sessionId, update.entries),
    };
    const state = await this.ledger.recordPrompt(
      update.sessionId,
      stateBeforePrompt,
      update.nowMs,
      update.config,
    );
    this.recordTimeLogSettlement(update, stateBeforePrompt, state);
    this.timeLogRecorder.recordPromptStart(
      update.sessionId,
      update.cwd,
      update.nowMs,
    );
    this.persist(update.sessionId, state);
    return state;
  }

  async settle(update) {
    const stateBeforeSettlement = {
      ...this.stateFor(update.sessionId, update.entries),
    };
    const state = await this.ledger.settle(
      update.sessionId,
      stateBeforeSettlement,
      update.nowMs,
      update.config,
    );
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
      DEVELOPER_COST_STATE_ENTRY,
      serializeDeveloperCostState(state),
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
