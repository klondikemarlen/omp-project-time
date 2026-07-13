import { errorMessage } from "../utils/error-message.js";
import { createAutomaticTimeLogEntry } from "./domain/create-automatic-entry.js";
import { TimeLogLedger } from "./infrastructure/ledger.js";
import { resolveGitRepository } from "./infrastructure/git-repository.js";

export class AutomaticTimeLogRecorder {
  lastErrorMessage;

  ledger;

  repositoryLookups = new Map();

  sessionRepositories = new Map();

  writeQueues = new Map();

  pendingEntries = new Map();

  constructor(timeLogPath) {
    this.ledger = new TimeLogLedger(timeLogPath);
  }

  recordPromptStart(sessionId, cwd, promptAtMs) {
    this.sessionRepositories.set(sessionId, {
      repository: this.repositoryFor(cwd),
      startedAtMs: promptAtMs,
    });
  }

  recordSettlement(settlement, notifyError) {
    const sessionRepository = this.sessionRepositories.get(
      settlement.sessionId,
    );
    const previousWrite =
      this.writeQueues.get(settlement.sessionId) ?? Promise.resolve();
    const nextWrite = previousWrite.then(async () => {
      try {
        await this.recordAutomaticInterval(settlement, sessionRepository);
        this.lastErrorMessage = undefined;
      } catch (error) {
        this.reportError(error, notifyError);
      }
    });
    this.writeQueues.set(settlement.sessionId, nextWrite);
    void nextWrite.finally(() => {
      if (this.writeQueues.get(settlement.sessionId) === nextWrite) {
        this.writeQueues.delete(settlement.sessionId);
      }
    });
  }

  async flush(sessionId, notifyError) {
    await this.writeQueues.get(sessionId);
    this.writeQueues.delete(sessionId);
    const pendingEntries = this.pendingEntries.get(sessionId);
    if (pendingEntries !== undefined) {
      try {
        await this.persistPendingEntries(sessionId, pendingEntries);
        this.lastErrorMessage = undefined;
      } catch (error) {
        this.reportError(error, notifyError);
      }
    }
    this.sessionRepositories.delete(sessionId);
  }

  async recordAutomaticInterval(settlement, sessionRepository) {
    const entry = await this.automaticEntry(settlement, sessionRepository);
    if (entry === undefined) return;
    const pendingEntries =
      this.pendingEntries.get(settlement.sessionId) ?? new Map();
    const previousEntry = pendingEntries.get(entry.sourceKey);
    const entryToPersist =
      previousEntry === undefined
        ? entry
        : {
            ...entry,
            startAtMs: Math.min(previousEntry.startAtMs, entry.startAtMs),
            endAtMs: Math.max(previousEntry.endAtMs, entry.endAtMs),
          };
    pendingEntries.set(entry.sourceKey, entryToPersist);
    this.pendingEntries.set(settlement.sessionId, pendingEntries);
    await this.persistPendingEntries(settlement.sessionId, pendingEntries);
  }

  async automaticEntry(settlement, sessionRepository) {
    const stateBeforeSettlement = settlement.stateBeforeSettlement;
    if (
      stateBeforeSettlement.activeStartAtMs === undefined ||
      stateBeforeSettlement.activeUntilMs === undefined
    ) {
      return undefined;
    }
    const settledMilliseconds =
      settlement.settledState.activeMilliseconds -
      stateBeforeSettlement.activeMilliseconds;
    if (settledMilliseconds <= 0) return undefined;
    const repository = await this.repositoryForSettlement(
      settlement,
      sessionRepository,
    );
    if (repository === undefined) return undefined;
    const sourceStartedAtMs =
      sessionRepository?.startedAtMs ??
      settlement.stateBeforeSettlement.activeStartAtMs;
    if (sourceStartedAtMs === undefined) return undefined;
    return createAutomaticTimeLogEntry({
      nowMs: settlement.nowMs,
      repository,
      sessionId: settlement.sessionId,
      sourceStartedAtMs,
      stateBeforeSettlement: settlement.stateBeforeSettlement,
      settledState: settlement.settledState,
    });
  }

  async repositoryForSettlement(settlement, sessionRepository) {
    return sessionRepository?.repository ?? this.repositoryFor(settlement.cwd);
  }

  async persistPendingEntries(sessionId, entries) {
    for (const sourceKey of [...entries.keys()]) {
      const entry = entries.get(sourceKey);
      if (entry === undefined) continue;
      await this.ledger.recordAutomatic(entry);
      entries.delete(sourceKey);
    }
    if (entries.size === 0) this.pendingEntries.delete(sessionId);
  }

  reportError(error, notifyError) {
    const message = errorMessage(error);
    if (this.lastErrorMessage === message) return;
    this.lastErrorMessage = message;
    notifyError(message);
  }

  repositoryFor(cwd) {
    const cachedRepository = this.repositoryLookups.get(cwd);
    if (cachedRepository !== undefined) return cachedRepository;
    const repository = resolveGitRepository(cwd).catch(() => undefined);
    this.repositoryLookups.set(cwd, repository);
    void repository.then((resolvedRepository) => {
      if (
        resolvedRepository === undefined &&
        this.repositoryLookups.get(cwd) === repository
      ) {
        this.repositoryLookups.delete(cwd);
      }
    });
    return repository;
  }
}
