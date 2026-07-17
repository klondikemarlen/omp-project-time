import type { DeveloperCostConfig, DeveloperCostState } from "@/billing/index.js"
import { errorMessage } from "@/utils/error-message.js"
import { createAutomaticTimeLogEntry } from "@/time-log/domain/create-automatic-entry.js"
import { TimeLogLedger } from "@/time-log/infrastructure/ledger.js"
import type { AutomaticTimeLogInput, TimeLogEntry } from "@/time-log/domain/model.js"
import {
  resolveGitRepository,
  type GitRepository,
} from "@/infrastructure/git-repository.js"
import { normalizeBillableRepository } from "@/billable-time/domain/repository.js"

type Settlement = {
  config: DeveloperCostConfig
  cwd: string
  nowMs: number
  sessionId: string
  stateBeforeSettlement: DeveloperCostState
  settledState: DeveloperCostState
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

  recordPromptStart(sessionId: string, cwd: string, promptAtMs: number): void {
    this.sessionActivities.set(
      sessionId,
      new SessionActivity(this.repositoryFor(cwd), promptAtMs),
    )
  }

  recordSettlement(settlement: Settlement, notifyError: ErrorNotifier): void {
    const activity = this.sessionActivityFor(settlement.sessionId)
    activity.enqueue(
      () => this.automaticEntry(settlement, activity),
      (entry) => this.ledger.recordAutomatic(entry),
      () => {
        this.lastErrorMessage = undefined
      },
      (error) => this.reportError(error, notifyError),
    )
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

  private async automaticEntry(
    settlement: Settlement,
    activity: SessionActivity,
  ): Promise<AutomaticTimeLogInput | undefined> {
    const stateBeforeSettlement = settlement.stateBeforeSettlement
    if (
      stateBeforeSettlement.activeStartAtMs === undefined ||
      stateBeforeSettlement.activeUntilMs === undefined
    ) {
      return undefined
    }

    const settledMilliseconds =
      settlement.settledState.activeMilliseconds -
      stateBeforeSettlement.activeMilliseconds
    if (settledMilliseconds <= 0) return undefined

    const repository = await this.repositoryForSettlement(settlement, activity)
    if (repository === undefined) return undefined

    const sourceStartedAtMs =
      activity.startedAtMs ?? stateBeforeSettlement.activeStartAtMs
    const entry = createAutomaticTimeLogEntry({
      nowMs: settlement.nowMs,
      repository,
      sessionId: settlement.sessionId,
      sourceStartedAtMs,
      stateBeforeSettlement: settlement.stateBeforeSettlement,
      settledState: settlement.settledState,
    })
    if (entry === undefined) return undefined

    const identity = repository.identity
    if (identity === undefined) return entry
    const policy = settlement.config.billableTime.policiesByRepository.get(
      normalizeBillableRepository(identity),
    )
    if (policy === undefined) return entry

    return {
      ...entry,
      timesheet: {
        projectId: policy.project.id,
        projectName: policy.project.label,
        categoryId: policy.category.id,
        categoryLabel: policy.category.label,
      },
    }
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
        resolvedRepository === undefined &&
        this.repositoryLookups.get(cwd) === repository
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

  constructor(
    readonly repository?: Promise<GitRepository | undefined>,
    readonly startedAtMs?: number,
  ) {}

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
