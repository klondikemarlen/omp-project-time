import { errorMessage } from "../utils/error-message.js";
import { createAutomaticTimeLogEntry } from "../time-log/domain/create-automatic-entry.js";
import { TimeLogLedger } from "../time-log/infrastructure/ledger.js";
import { resolveGitRepository } from "../time-log/infrastructure/git-repository.js";

export class AutomaticTimeLogRecorder {
  lastErrorMessage;

  ledger;

  repositoryLookups = new Map();

  sessionActivities = new Map();

  constructor(timeLogPath) {
    this.ledger = new TimeLogLedger(timeLogPath);
  }

  recordPromptStart(sessionId, cwd, promptAtMs) {
    this.sessionActivities.set(
      sessionId,
      new SessionActivity(this.repositoryFor(cwd), promptAtMs),
    );
  }

  recordSettlement(settlement, notifyError) {
    const activity = this.sessionActivityFor(settlement.sessionId);
    activity.enqueue(
      () => this.automaticEntry(settlement, activity),
      (entry) => this.ledger.recordAutomatic(entry),
      () => {
        this.lastErrorMessage = undefined;
      },
      (error) => this.reportError(error, notifyError),
    );
  }

  async flush(sessionId, notifyError) {
    const activity = this.sessionActivities.get(sessionId);
    if (activity !== undefined) {
      await activity.flush(
        (entry) => this.ledger.recordAutomatic(entry),
        () => {
          this.lastErrorMessage = undefined;
        },
        (error) => this.reportError(error, notifyError),
      );
    }
    this.sessionActivities.delete(sessionId);
  }

  async entries() {
    return this.ledger.entries();
  }

  async automaticEntry(settlement, activity) {
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
    const repository = await this.repositoryForSettlement(settlement, activity);
    if (repository === undefined) return undefined;
    const sourceStartedAtMs =
      activity.startedAtMs ?? stateBeforeSettlement.activeStartAtMs;
    return createAutomaticTimeLogEntry({
      nowMs: settlement.nowMs,
      repository,
      sessionId: settlement.sessionId,
      sourceStartedAtMs,
      stateBeforeSettlement: settlement.stateBeforeSettlement,
      settledState: settlement.settledState,
    });
  }

  async repositoryForSettlement(settlement, activity) {
    return activity.repository ?? this.repositoryFor(settlement.cwd);
  }

  sessionActivityFor(sessionId) {
    const existingActivity = this.sessionActivities.get(sessionId);
    if (existingActivity !== undefined) return existingActivity;
    const activity = new SessionActivity();
    this.sessionActivities.set(sessionId, activity);
    return activity;
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

class SessionActivity {
  repository;

  startedAtMs;

  pendingEntries = new Map();

  writeQueue = Promise.resolve();

  constructor(repository, startedAtMs) {
    this.repository = repository;
    this.startedAtMs = startedAtMs;
  }

  enqueue(createEntry, persist, onSuccess, onError) {
    this.writeQueue = this.writeQueue.then(async () => {
      try {
        const entry = await createEntry();
        if (entry !== undefined) {
          this.remember(entry);
          await this.persistPendingEntries(persist);
        }
        onSuccess();
      } catch (error) {
        onError(error);
      }
    });
  }

  async flush(persist, onSuccess, onError) {
    await this.writeQueue;
    try {
      await this.persistPendingEntries(persist);
      onSuccess();
    } catch (error) {
      onError(error);
    }
  }

  remember(entry) {
    const previousEntry = this.pendingEntries.get(entry.sourceKey);
    this.pendingEntries.set(
      entry.sourceKey,
      previousEntry === undefined
        ? entry
        : {
            ...entry,
            startAtMs: Math.min(previousEntry.startAtMs, entry.startAtMs),
            endAtMs: Math.max(previousEntry.endAtMs, entry.endAtMs),
          },
    );
  }

  async persistPendingEntries(persist) {
    for (const [sourceKey, entry] of this.pendingEntries) {
      await persist(entry);
      this.pendingEntries.delete(sourceKey);
    }
  }
}
