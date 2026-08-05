import { errorMessage } from "../utils/error-message.js";
import { createAutomaticTimeLogEntry } from "../time-log/domain/create-automatic-entry.js";
import { TimeLogLedger } from "../time-log/infrastructure/ledger.js";
import { resolveGitRepository } from "../infrastructure/git-repository.js";

export class AutomaticTimeLogRecorder {
  lastErrorMessage;

  ledger;

  repositoryLookups = new Map();

  sessionActivities = new Map();

  constructor(timeLogPath) {
    this.ledger = new TimeLogLedger(timeLogPath);
  }

  recordPromptStart(
    sessionId,
    cwd,
    promptAtMs,
    activityLabel,
    narrative,
    notifyError,
    workItem,
  ) {
    const repository = this.repositoryFor(cwd);
    const activity = this.sessionActivityFor(sessionId);
    if (activity.agentTurnStartAtMs !== undefined) {
      this.closeAgentTurn(
        activity,
        {
          endAtMs: promptAtMs,
          sessionId,
          startAtMs: activity.agentTurnStartAtMs,
        },
        notifyError,
      );
    }
    activity.setPromptStart(
      repository,
      promptAtMs,
      activityLabel,
      narrative,
      workItem,
    );
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

  recordAgentTurnEnd(sessionId, endAtMs, notifyError) {
    const activity = this.sessionActivities.get(sessionId);
    if (activity === undefined || activity.agentTurnStartAtMs === undefined)
      return;
    this.closeAgentTurn(
      activity,
      {
        endAtMs,
        sessionId,
        startAtMs: activity.agentTurnStartAtMs,
      },
      notifyError,
    );
  }

  recordActivityChange(
    sessionId,
    atMs,
    activityLabel,
    narrative,
    notifyError,
    workItem,
  ) {
    const activity = this.sessionActivities.get(sessionId);
    if (activity === undefined) return;
    const agentTurnStartAtMs = activity.agentTurnStartAtMs;
    const agentRepository = activity.agentRepository;
    if (agentTurnStartAtMs !== undefined) {
      this.closeAgentTurn(
        activity,
        { endAtMs: atMs, sessionId, startAtMs: agentTurnStartAtMs },
        notifyError,
      );
      activity.agentTurnStartAtMs = atMs;
      activity.agentRepository = agentRepository;
    }
    activity.activity = activityLabel;
    activity.narrative = narrative;
    activity.workItem = workItem;
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

  projectNames() {
    return this.ledger.projectNames();
  }

  closeAgentTurn(activity, turn, notifyError) {
    const startAtMs = activity.agentTurnStartAtMs;
    const agentRepository = activity.agentRepository;
    const agentActivity = activity.activity;
    const agentNarrative = activity.narrative;
    const agentWorkItem = activity.workItem;
    if (startAtMs === undefined) return;
    activity.agentTurnStartAtMs = undefined;
    activity.agentRepository = undefined;
    activity.enqueue(
      () =>
        this.agentEntry({
          ...turn,
          startAtMs,
          repository: agentRepository,
          activity: agentActivity,
          narrative: agentNarrative,
          workItem: agentWorkItem,
        }),
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
      activity: stateBeforeSettlement.activity,
      narrative: stateBeforeSettlement.narrative,
      workItem: stateBeforeSettlement.workItem,
      activityStartedAtMs: stateBeforeSettlement.activityStartedAtMs,
      stateBeforeSettlement,
      settledState: settlement.settledState,
    });
    if (entry === undefined) return undefined;
    return entry;
  }

  async agentEntry(turn) {
    if (turn.startAtMs >= turn.endAtMs) return undefined;
    const repository = await (turn.repository ?? Promise.resolve(undefined));
    if (repository === undefined) return undefined;
    const entry = {
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
    };
    return entry;
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
  pendingEntries = new Map();

  writeQueue = Promise.resolve();

  repository;

  startedAtMs;

  agentTurnStartAtMs;

  agentRepository;

  activity;

  narrative;

  workItem;

  setPromptStart(repository, startedAtMs, activity, narrative, workItem) {
    this.repository = repository;
    this.agentRepository = repository;
    this.startedAtMs = startedAtMs;
    this.agentTurnStartAtMs = startedAtMs;
    this.activity = activity;
    this.narrative = narrative;
    this.workItem = workItem;
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
