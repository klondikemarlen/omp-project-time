import { errorMessage } from "../utils/error-message.js";
import { createAutomaticTimeLogEntry } from "../time-log/domain/create-automatic-entry.js";
import { TimeLogLedger } from "../time-log/infrastructure/ledger.js";
import { resolveGitRepository } from "../infrastructure/git-repository.js";
import { normalizeRepositoryIdentity } from "../infrastructure/repository-identity.js";

export class AutomaticTimeLogRecorder {
  lastErrorMessage;

  ledger;

  repositoryLookups = new Map();

  sessionActivities = new Map();

  constructor(timeLogPath) {
    this.ledger = new TimeLogLedger(timeLogPath);
  }

  recordPromptStart(sessionId, cwd, promptAtMs, config, notifyError) {
    const repository = this.repositoryFor(cwd);
    const activity = this.sessionActivityFor(sessionId);
    if (activity.agentTurnStartAtMs !== undefined) {
      this.closeAgentTurn(
        activity,
        {
          config,
          cwd,
          endAtMs: promptAtMs,
          sessionId,
          startAtMs: activity.agentTurnStartAtMs,
        },
        notifyError,
      );
    }
    activity.setPromptStart(repository, promptAtMs);
  }

  recordSettlement(settlement, notifyError) {
    const activity = this.sessionActivityFor(settlement.sessionId);
    activity.enqueue(
      () => this.humanEntry(settlement, activity),
      (entry) => this.ledger.recordAutomatic(entry),
      () => {
        this.lastErrorMessage = undefined;
      },
      (error) => this.reportError(error, notifyError),
    );
  }

  recordAgentTurnEnd(sessionId, endAtMs, config, notifyError) {
    const activity = this.sessionActivities.get(sessionId);
    if (activity === undefined || activity.agentTurnStartAtMs === undefined)
      return;
    this.closeAgentTurn(
      activity,
      {
        config,
        cwd: "",
        endAtMs,
        sessionId,
        startAtMs: activity.agentTurnStartAtMs,
      },
      notifyError,
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

  closeAgentTurn(activity, turn, notifyError) {
    const startAtMs = activity.agentTurnStartAtMs;
    const agentRepository = activity.agentRepository;
    if (startAtMs === undefined) return;
    activity.agentTurnStartAtMs = undefined;
    activity.agentRepository = undefined;
    activity.enqueue(
      () =>
        this.agentEntry({ ...turn, startAtMs, repository: agentRepository }),
      (entry) => this.ledger.recordAutomatic(entry),
      () => {
        this.lastErrorMessage = undefined;
      },
      (error) => this.reportError(error, notifyError),
    );
  }

  async humanEntry(settlement, activity) {
    const stateBeforeSettlement = settlement.stateBeforeSettlement;
    if (
      stateBeforeSettlement.activeStartAtMs === undefined ||
      stateBeforeSettlement.activeUntilMs === undefined
    ) {
      return undefined;
    }
    const repository = await this.repositoryForSettlement(settlement, activity);
    if (repository === undefined) return undefined;
    const sourceStartedAtMs =
      activity.startedAtMs ?? stateBeforeSettlement.activeStartAtMs;
    const entry = createAutomaticTimeLogEntry({
      nowMs: settlement.nowMs,
      repository,
      sessionId: settlement.sessionId,
      sourceStartedAtMs,
      stateBeforeSettlement,
      settledState: settlement.settledState,
    });
    if (entry === undefined) return undefined;
    return this.withAttribution(entry, repository, settlement.config);
  }

  async agentEntry(turn) {
    if (turn.startAtMs >= turn.endAtMs) return undefined;
    const repository = await (turn.repository ?? Promise.resolve(undefined));
    if (repository === undefined) return undefined;
    const entry = {
      sourceKind: "agent_turn_elapsed",
      project: repository.project,
      repositoryId: repository.repositoryId,
      sessionId: turn.sessionId,
      sourceKey: `${turn.sessionId}:${repository.repositoryId}:${turn.startAtMs}:agent`,
      startAtMs: turn.startAtMs,
      endAtMs: turn.endAtMs,
    };
    return this.withAttribution(entry, repository, turn.config);
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

  withAttribution(entry, repository, config) {
    const identity = repository.identity;
    if (identity === undefined) return entry;
    const attribution = config.repositoryAttribution.get(
      normalizeRepositoryIdentity(identity),
    );
    if (attribution === undefined) return entry;
    return {
      ...entry,
      attribution: {
        projectId: attribution.project.id,
        projectName: attribution.project.label,
        categoryId: attribution.category.id,
        categoryLabel: attribution.category.label,
        ...(attribution.task === undefined ? {} : { task: attribution.task }),
      },
    };
  }
}

class SessionActivity {
  pendingEntries = new Map();

  writeQueue = Promise.resolve();

  repository;

  startedAtMs;

  agentTurnStartAtMs;

  agentRepository;

  setPromptStart(repository, startedAtMs) {
    this.repository = repository;
    this.agentRepository = repository;
    this.startedAtMs = startedAtMs;
    this.agentTurnStartAtMs = startedAtMs;
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
