import type { ProjectTimeConfig } from "@/config/project-time-config.js"
import {
  PROJECT_TIME_STATE_ENTRY,
  loadPersistedProjectTimeState,
} from "@/extension/session-state.js"
import type { SessionEntryLike } from "@/extension/types.js"
import {
  emptyProjectTimeState,
  recordProjectTimePrompt,
  serializeProjectTimeState,
  setProjectTimeActivity,
  settleProjectTimeState,
  type ProjectTimeState,
} from "@/time-log/domain/state.js"
import { AutomaticTimeLogRecorder } from "@/time-log/recorder.js"
import type { ActivityNarrative } from "@/time-log/domain/narrative.js"

type TimeLogErrorNotifier = (message: string) => void

type SessionUpdate = {
  config: ProjectTimeConfig
  cwd: string
  entries: readonly SessionEntryLike[]
  nowMs: number
  sessionId: string
  notifyTimeLogError: TimeLogErrorNotifier
}

export class SessionStateCoordinator {
  private readonly states = new Map<string, ProjectTimeState>()

  constructor(
    private readonly timeLogRecorder: AutomaticTimeLogRecorder,
    private readonly appendEntry: (customType: string, data?: unknown) => void,
  ) {}

  stateFor(
    sessionId: string,
    entries: readonly SessionEntryLike[],
  ): ProjectTimeState {
    return this.states.get(sessionId) ?? loadPersistedProjectTimeState(entries)
  }

  async recordPrompt(update: SessionUpdate): Promise<ProjectTimeState> {
    const stateBeforePrompt = { ...this.stateFor(update.sessionId, update.entries) }
    const state = recordProjectTimePrompt(
      stateBeforePrompt,
      update.nowMs,
      update.config,
    )
    this.recordTimeLogSettlement(update, stateBeforePrompt, state)
    this.timeLogRecorder.recordPromptStart(
      update.sessionId,
      update.cwd,
      update.nowMs,
      state.activity,
      state.narrative,
      update.notifyTimeLogError,
    )
    this.persist(update.sessionId, state)
    return state
  }

  async settle(update: SessionUpdate): Promise<ProjectTimeState> {
    const stateBeforeSettlement = {
      ...this.stateFor(update.sessionId, update.entries),
    }
    const state = settleProjectTimeState(stateBeforeSettlement, update.nowMs)
    this.recordTimeLogSettlement(update, stateBeforeSettlement, state)
    this.persist(update.sessionId, state)
    return state
  }

  async setActivity(
    update: SessionUpdate,
    activity: string | undefined,
    narrative: ActivityNarrative | undefined,
  ): Promise<ProjectTimeState> {
    const stateBeforeSettlement = {
      ...this.stateFor(update.sessionId, update.entries),
    }
    const settledState = settleProjectTimeState(
      stateBeforeSettlement,
      update.nowMs,
    )
    this.recordTimeLogSettlement(update, stateBeforeSettlement, settledState)
    const state = setProjectTimeActivity(
      settledState,
      activity,
      narrative,
      update.nowMs,
    )
    this.timeLogRecorder.recordActivityChange(
      update.sessionId,
      update.nowMs,
      activity,
      narrative,
      update.notifyTimeLogError,
    )
    this.persist(update.sessionId, state)
    return state
  }

  async flush(sessionId: string, notifyTimeLogError: TimeLogErrorNotifier): Promise<void> {
    await this.timeLogRecorder.flush(sessionId, notifyTimeLogError)
    this.states.delete(sessionId)
  }

  private persist(sessionId: string, state: ProjectTimeState): void {
    this.states.set(sessionId, state)
    this.appendEntry(PROJECT_TIME_STATE_ENTRY, serializeProjectTimeState(state))
  }

  private recordTimeLogSettlement(
    update: SessionUpdate,
    stateBeforeSettlement: ProjectTimeState,
    settledState: ProjectTimeState,
  ): void {
    this.timeLogRecorder.recordSettlement(
      {
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
