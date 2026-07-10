import type { DeveloperCostState } from "../billing/index.js"
import { errorMessage } from "../utils/error-message.js"
import { createAutomaticTimeLogEntry } from "./domain/create-automatic-entry.js"
import { TimeLogLedger } from "./infrastructure/ledger.js"
import type { AutomaticTimeLogInput } from "./domain/model.js"
import { resolveGitRepository, type GitRepository } from "./infrastructure/git-repository.js"

type SessionRepository = {
  repository: Promise<GitRepository | undefined>
  startedAtMs: number
}

type Settlement = {
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
  private readonly repositoryLookups = new Map<string, Promise<GitRepository | undefined>>()
  private readonly sessionRepositories = new Map<string, SessionRepository>()
  private readonly writeQueues = new Map<string, Promise<void>>()
  private readonly pendingEntries = new Map<string, Map<string, AutomaticTimeLogInput>>()

  constructor(timeLogPath?: string) {
    this.ledger = new TimeLogLedger(timeLogPath)
  }

  recordPromptStart(sessionId: string, cwd: string, promptAtMs: number): void {
    this.sessionRepositories.set(sessionId, {
      repository: this.repositoryFor(cwd),
      startedAtMs: promptAtMs,
    })
  }

  recordSettlement(settlement: Settlement, notifyError: ErrorNotifier): void {
    const sessionRepository = this.sessionRepositories.get(settlement.sessionId)
    const previousWrite = this.writeQueues.get(settlement.sessionId) ?? Promise.resolve()
    const nextWrite = previousWrite.then(async () => {
      try {
        await this.recordAutomaticInterval(settlement, sessionRepository)
        this.lastErrorMessage = undefined
      } catch (error) {
        this.reportError(error, notifyError)
      }
    })

    this.writeQueues.set(settlement.sessionId, nextWrite)
    void nextWrite.finally(() => {
      if (this.writeQueues.get(settlement.sessionId) === nextWrite) {
        this.writeQueues.delete(settlement.sessionId)
      }
    })
  }

  async flush(sessionId: string, notifyError: ErrorNotifier): Promise<void> {
    await this.writeQueues.get(sessionId)
    this.writeQueues.delete(sessionId)

    const pendingEntries = this.pendingEntries.get(sessionId)
    if (pendingEntries !== undefined) {
      try {
        await this.persistPendingEntries(sessionId, pendingEntries)
        this.lastErrorMessage = undefined
      } catch (error) {
        this.reportError(error, notifyError)
      }
    }

    this.sessionRepositories.delete(sessionId)
  }

  private async recordAutomaticInterval(
    settlement: Settlement,
    sessionRepository: SessionRepository | undefined,
  ): Promise<void> {
    const entry = await this.automaticEntry(settlement, sessionRepository)
    if (entry === undefined) return

    const pendingEntries = this.pendingEntries.get(settlement.sessionId) ?? new Map()
    const previousEntry = pendingEntries.get(entry.sourceKey)
    const entryToPersist = previousEntry === undefined
      ? entry
      : {
          ...entry,
          startAtMs: Math.min(previousEntry.startAtMs, entry.startAtMs),
          endAtMs: Math.max(previousEntry.endAtMs, entry.endAtMs),
        }

    pendingEntries.set(entry.sourceKey, entryToPersist)
    this.pendingEntries.set(settlement.sessionId, pendingEntries)
    await this.persistPendingEntries(settlement.sessionId, pendingEntries)
  }

  private async automaticEntry(
    settlement: Settlement,
    sessionRepository: SessionRepository | undefined,
  ): Promise<AutomaticTimeLogInput | undefined> {
    const stateBeforeSettlement = settlement.stateBeforeSettlement
    if (stateBeforeSettlement.activeStartAtMs === undefined || stateBeforeSettlement.activeUntilMs === undefined) {
      return undefined
    }

    const settledMilliseconds = settlement.settledState.activeMilliseconds - stateBeforeSettlement.activeMilliseconds
    if (settledMilliseconds <= 0) return undefined

    const repository = await this.repositoryForSettlement(settlement, sessionRepository)
    if (repository === undefined) return undefined

    const sourceStartedAtMs = sessionRepository?.startedAtMs ?? settlement.stateBeforeSettlement.activeStartAtMs
    if (sourceStartedAtMs === undefined) return undefined
    return createAutomaticTimeLogEntry({
      nowMs: settlement.nowMs,
      repository,
      sessionId: settlement.sessionId,
      sourceStartedAtMs,
      stateBeforeSettlement: settlement.stateBeforeSettlement,
      settledState: settlement.settledState,
    })
  }

  private async repositoryForSettlement(
    settlement: Settlement,
    sessionRepository: SessionRepository | undefined,
  ): Promise<GitRepository | undefined> {
    return sessionRepository?.repository ?? this.repositoryFor(settlement.cwd)
  }

  private async persistPendingEntries(
    sessionId: string,
    entries: Map<string, AutomaticTimeLogInput>,
  ): Promise<void> {
    for (const sourceKey of [...entries.keys()]) {
      const entry = entries.get(sourceKey)
      if (entry === undefined) continue

      await this.ledger.recordAutomatic(entry)
      entries.delete(sourceKey)
    }

    if (entries.size === 0) this.pendingEntries.delete(sessionId)
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
      if (resolvedRepository === undefined && this.repositoryLookups.get(cwd) === repository) {
        this.repositoryLookups.delete(cwd)
      }
    })
    return repository
  }
}
