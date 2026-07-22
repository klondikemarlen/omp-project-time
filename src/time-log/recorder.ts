import { errorMessage } from "@/utils/error-message.js"
import { createAutomaticTimeLogEntry } from "@/time-log/domain/create-automatic-entry.js"
import { TimeLogLedger } from "@/time-log/infrastructure/ledger.js"
import type { AutomaticTimeLogInput, TimeLogEntry } from "@/time-log/domain/model.js"
import type { ProjectTimeState } from "@/time-log/domain/state.js"
import type { ActivityNarrative } from "@/time-log/domain/narrative.js"
import type { WorkItem } from "@/time-log/domain/work-item.js"
import {
  resolveGitRepository,
  type GitRepository,
} from "@/infrastructure/git-repository.js"

type Settlement = {
  cwd: string
  nowMs: number
  sessionId: string
  stateBeforeSettlement: ProjectTimeState
  settledState: ProjectTimeState
}

type AgentTurn = {
  activity?: string
  narrative?: ActivityNarrative
  workItem?: WorkItem
  endAtMs: number
  sessionId: string
  startAtMs: number
}

type ErrorNotifier = (message: string) => void

export class AutomaticTimeLogRecorder {
  private lastErrorMessage: string | undefined
  private readonly ledger: TimeLogLedger
  private readonly repositoryLookups = new Map<
    string,
    Promise<GitRepository | undefined>
  >()
  private readonly sessionActivities = new Map<string, SessionActivity>()

  constructor(timeLogPath?: string) {
    this.ledger = new TimeLogLedger(timeLogPath)
  }

  recordPromptStart(
    sessionId: string,
    cwd: string,
    promptAtMs: number,
    activityLabel: string | undefined,
    narrative: ActivityNarrative | undefined,
    notifyError: ErrorNotifier,
    workItem?: WorkItem,
  ): void {
    const repository = this.repositoryFor(cwd)
    const activity = this.sessionActivityFor(sessionId)

    if (activity.agentTurnStartAtMs !== undefined) {
      this.closeAgentTurn(
        activity,
        {
          endAtMs: promptAtMs,
          sessionId,
          startAtMs: activity.agentTurnStartAtMs,
        },
        notifyError,
      )
    }

    activity.setPromptStart(repository, promptAtMs, activityLabel, narrative, workItem)
  }

  recordSettlement(
    settlement: Settlement,
    notifyError: ErrorNotifier,
  ): void {
    const activity = this.sessionActivityFor(settlement.sessionId)
    activity.enqueue(
      () => this.humanEntry(settlement, activity),
      (entry) => this.ledger.recordAutomatic(entry),
      () => {
        this.lastErrorMessage = undefined
      },
      (error) => this.reportError(error, notifyError),
    )
  }

  recordAgentTurnEnd(
    sessionId: string,
    endAtMs: number,
    notifyError: ErrorNotifier,
  ): void {
    const activity = this.sessionActivities.get(sessionId)
    if (activity === undefined || activity.agentTurnStartAtMs === undefined) return

    this.closeAgentTurn(
      activity,
      {
        endAtMs,
        sessionId,
        startAtMs: activity.agentTurnStartAtMs,
      },
      notifyError,
    )
  }

  recordActivityChange(
    sessionId: string,
    atMs: number,
    activityLabel: string | undefined,
    narrative: ActivityNarrative | undefined,
    notifyError: ErrorNotifier,
    workItem?: WorkItem,
  ): void {
    const activity = this.sessionActivities.get(sessionId)
    if (activity === undefined) return

    const agentTurnStartAtMs = activity.agentTurnStartAtMs
    const agentRepository = activity.agentRepository
    if (agentTurnStartAtMs !== undefined) {
      this.closeAgentTurn(
        activity,
        { endAtMs: atMs, sessionId, startAtMs: agentTurnStartAtMs },
        notifyError,
      )
      activity.agentTurnStartAtMs = atMs
      activity.agentRepository = agentRepository
    }

    activity.activity = activityLabel
    activity.narrative = narrative
    activity.workItem = workItem
  }

  async flush(sessionId: string, notifyError: ErrorNotifier): Promise<void> {
    const activity = this.sessionActivities.get(sessionId)
    if (activity !== undefined) {
      await activity.flush(
        (entry) => this.ledger.recordAutomatic(entry),
        () => {
          this.lastErrorMessage = undefined
        },
        (error) => this.reportError(error, notifyError),
      )
    }

    this.sessionActivities.delete(sessionId)
  }

  async entries(): Promise<TimeLogEntry[]> {
    return this.ledger.entries()
  }

  projectNames(): string[] {
    return this.ledger.projectNames()
  }

  private closeAgentTurn(
    activity: SessionActivity,
    turn: AgentTurn,
    notifyError: ErrorNotifier,
  ): void {
    const startAtMs = activity.agentTurnStartAtMs
    const agentRepository = activity.agentRepository
    const agentActivity = activity.activity
    const agentNarrative = activity.narrative
    const agentWorkItem = activity.workItem
    if (startAtMs === undefined) return

    activity.agentTurnStartAtMs = undefined
    activity.agentRepository = undefined

    activity.enqueue(
      () => this.agentEntry({
        ...turn,
        startAtMs,
        repository: agentRepository,
        activity: agentActivity,
        narrative: agentNarrative,
        workItem: agentWorkItem,
      }),
      (entry) => this.ledger.recordAutomatic(entry),
      () => {
        this.lastErrorMessage = undefined
      },
      (error) => this.reportError(error, notifyError),
    )
  }

  private async humanEntry(
    settlement: Settlement,
    activity: SessionActivity,
  ): Promise<AutomaticTimeLogInput | undefined> {
    const stateBeforeSettlement = settlement.stateBeforeSettlement
    if (
      stateBeforeSettlement.activeStartAtMs === undefined
      || stateBeforeSettlement.activeUntilMs === undefined
    ) {
      return undefined
    }

    const repository = await this.repositoryForSettlement(settlement, activity)
    if (repository === undefined) return undefined

    const sourceStartedAtMs =
      activity.startedAtMs ?? stateBeforeSettlement.activeStartAtMs
    const entry = createAutomaticTimeLogEntry({
      nowMs: settlement.nowMs,
      repository,
      sessionId: settlement.sessionId,
      sourceStartedAtMs,
      activity: stateBeforeSettlement.activity,
      narrative: stateBeforeSettlement.narrative,
      workItem: stateBeforeSettlement.workItem,
      activityStartedAtMs: stateBeforeSettlement.activityStartedAtMs,
      stateBeforeSettlement,
      settledState: settlement.settledState,
    })
    if (entry === undefined) return undefined

    return entry
  }

  private async agentEntry(
    turn: AgentTurn & { repository?: Promise<GitRepository | undefined> },
  ): Promise<AutomaticTimeLogInput | undefined> {
    if (turn.startAtMs >= turn.endAtMs) return undefined

    const repository = await (turn.repository ?? Promise.resolve(undefined))
    if (repository === undefined) return undefined

    const entry: AutomaticTimeLogInput = {
      sourceKind: "agent_turn_elapsed",
      project: repository.project,
      repositoryId: repository.repositoryId,
      ...(repository.repositoryIdentity === undefined
        ? {}
        : { repositoryIdentity: repository.repositoryIdentity }),
      sessionId: turn.sessionId,
      ...(turn.activity === undefined ? {} : { activity: turn.activity }),
      ...(turn.narrative === undefined ? {} : { narrative: turn.narrative }),
      ...(turn.workItem === undefined ? {} : { workItem: turn.workItem }),
      sourceKey: `${turn.sessionId}:${repository.repositoryId}:${turn.startAtMs}:agent`,
      startAtMs: turn.startAtMs,
      endAtMs: turn.endAtMs,
    }

    return entry
  }

  private async repositoryForSettlement(
    settlement: Settlement,
    activity: SessionActivity,
  ): Promise<GitRepository | undefined> {
    return activity.repository ?? this.repositoryFor(settlement.cwd)
  }

  private sessionActivityFor(sessionId: string): SessionActivity {
    const existingActivity = this.sessionActivities.get(sessionId)
    if (existingActivity !== undefined) return existingActivity

    const activity = new SessionActivity()
    this.sessionActivities.set(sessionId, activity)
    return activity
  }

  private reportError(error: unknown, notifyError: ErrorNotifier): void {
    const message = errorMessage(error)
    if (this.lastErrorMessage === message) return

    this.lastErrorMessage = message
    notifyError(message)
  }

  private repositoryFor(cwd: string): Promise<GitRepository | undefined> {
    const cachedRepository = this.repositoryLookups.get(cwd)
    if (cachedRepository !== undefined) return cachedRepository

    const repository = resolveGitRepository(cwd).catch(() => undefined)
    this.repositoryLookups.set(cwd, repository)
    void repository.then((resolvedRepository) => {
      if (
        resolvedRepository === undefined
        && this.repositoryLookups.get(cwd) === repository
      ) {
        this.repositoryLookups.delete(cwd)
      }
    })
    return repository
  }

}

class SessionActivity {
  private readonly pendingEntries = new Map<string, AutomaticTimeLogInput>()
  private writeQueue: Promise<void> = Promise.resolve()

  repository?: Promise<GitRepository | undefined>
  startedAtMs?: number
  agentTurnStartAtMs?: number
  agentRepository?: Promise<GitRepository | undefined>
  activity?: string
  narrative?: ActivityNarrative

  workItem?: WorkItem
  setPromptStart(
    repository: Promise<GitRepository | undefined>,
    startedAtMs: number,
    activity: string | undefined,
    narrative: ActivityNarrative | undefined,
    workItem: WorkItem | undefined,
  ): void {
    this.repository = repository
    this.agentRepository = repository
    this.startedAtMs = startedAtMs
    this.agentTurnStartAtMs = startedAtMs
    this.activity = activity
    this.narrative = narrative
    this.workItem = workItem
  }

  enqueue(
    createEntry: () => Promise<AutomaticTimeLogInput | undefined>,
    persist: (entry: AutomaticTimeLogInput) => Promise<unknown>,
    onSuccess: () => void,
    onError: (error: unknown) => void,
  ): void {
    this.writeQueue = this.writeQueue.then(async () => {
      try {
        const entry = await createEntry()
        if (entry !== undefined) {
          this.remember(entry)
          await this.persistPendingEntries(persist)
        }
        onSuccess()
      } catch (error) {
        onError(error)
      }
    })
  }

  async flush(
    persist: (entry: AutomaticTimeLogInput) => Promise<unknown>,
    onSuccess: () => void,
    onError: (error: unknown) => void,
  ): Promise<void> {
    await this.writeQueue

    try {
      await this.persistPendingEntries(persist)
      onSuccess()
    } catch (error) {
      onError(error)
    }
  }

  private remember(entry: AutomaticTimeLogInput): void {
    const previousEntry = this.pendingEntries.get(entry.sourceKey)
    this.pendingEntries.set(
      entry.sourceKey,
      previousEntry === undefined
        ? entry
        : {
            ...entry,
            startAtMs: Math.min(previousEntry.startAtMs, entry.startAtMs),
            endAtMs: Math.max(previousEntry.endAtMs, entry.endAtMs),
          },
    )
  }

  private async persistPendingEntries(
    persist: (entry: AutomaticTimeLogInput) => Promise<unknown>,
  ): Promise<void> {
    for (const [sourceKey, entry] of this.pendingEntries) {
      await persist(entry)
      this.pendingEntries.delete(sourceKey)
    }
  }
}
