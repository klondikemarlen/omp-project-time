import {
  serializeDeveloperCostState,
  type DeveloperCostConfig,
  type DeveloperCostState,
} from "@/billing/index.js"
import { SpreadBillingLedger } from "@/billing/infrastructure/spread-ledger.js"
import {
  DEVELOPER_COST_STATE_ENTRY,
  loadPersistedDeveloperCostState,
} from "@/extension/session-state.js"
import type { SessionEntryLike } from "@/extension/types.js"
import { AutomaticTimeLogRecorder } from "@/time-log/recorder.js"

type TimeLogErrorNotifier = (message: string) => void

type SessionUpdate = {
  config: DeveloperCostConfig
  cwd: string
  entries: readonly SessionEntryLike[]
  nowMs: number
  sessionId: string
  notifyTimeLogError: TimeLogErrorNotifier
}

export class SessionStateCoordinator {
  private readonly states = new Map<string, DeveloperCostState>()

  constructor(
    private readonly ledger: SpreadBillingLedger,
    private readonly timeLogRecorder: AutomaticTimeLogRecorder,
    private readonly appendEntry: (customType: string, data: unknown) => void,
  ) {}

  stateFor(sessionId: string, entries: readonly SessionEntryLike[]): DeveloperCostState {
    return this.states.get(sessionId) ?? loadPersistedDeveloperCostState(entries)
  }

  async recordPrompt(update: SessionUpdate): Promise<DeveloperCostState> {
    const stateBeforePrompt = { ...this.stateFor(update.sessionId, update.entries) }
    const state = await this.ledger.recordPrompt(
      update.sessionId,
      stateBeforePrompt,
      update.nowMs,
      update.config,
    )
    this.recordTimeLogSettlement(update, stateBeforePrompt, state)
    this.timeLogRecorder.recordPromptStart(update.sessionId, update.cwd, update.nowMs)
    this.persist(update.sessionId, state)
    return state
  }

  async settle(update: SessionUpdate): Promise<DeveloperCostState> {
    const stateBeforeSettlement = { ...this.stateFor(update.sessionId, update.entries) }
    const state = await this.ledger.settle(
      update.sessionId,
      stateBeforeSettlement,
      update.nowMs,
      update.config,
    )
    this.recordTimeLogSettlement(update, stateBeforeSettlement, state)
    this.persist(update.sessionId, state)
    return state
  }

  async flush(sessionId: string, notifyTimeLogError: TimeLogErrorNotifier): Promise<void> {
    await this.timeLogRecorder.flush(sessionId, notifyTimeLogError)
    this.states.delete(sessionId)
  }

  private persist(sessionId: string, state: DeveloperCostState): void {
    this.states.set(sessionId, state)
    this.appendEntry(DEVELOPER_COST_STATE_ENTRY, serializeDeveloperCostState(state))
  }

  private recordTimeLogSettlement(
    update: SessionUpdate,
    stateBeforeSettlement: DeveloperCostState,
    settledState: DeveloperCostState,
  ): void {
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
    )
  }
}
