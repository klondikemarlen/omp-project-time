import { errorMessage } from "../utils/error-message.js";
import { createAutomaticTimeLogEntry } from "../time-log/domain/create-automatic-entry.js";
import { TimeLogLedger } from "../time-log/infrastructure/ledger.js";
import { workItemKey } from "../time-log/domain/work-item.js";
import { gitContextKey } from "../time-log/domain/git-context.js";
import { resolveGitRepository } from "../infrastructure/git-repository.js";

export class AutomaticTimeLogRecorder {
  lastErrorMessage;

  ledger;

  repositoryLookups = new Map();

  sessionActivities = new Map();

  constructor(databasePath, legacyJsonPath) {
    this.ledger = new TimeLogLedger(databasePath, legacyJsonPath);
  }

  recordPromptStart(
    sessionId,
    cwd,
    promptAtMs,
    activityLabel,
    narrative,
    workItem,
    workItemAttribution,
    gitContext,
  ) {
    const repository = this.repositoryFor(cwd);
    const activity = this.sessionActivityFor(sessionId);
    activity.setPromptStart(
      repository,
      promptAtMs,
      activityLabel,
      narrative,
      workItem,
      workItemAttribution,
      gitContext,
    );
  }

  recordAgentStart(sessionId, startAtMs) {
    const activity = this.sessionActivityFor(sessionId);
    if (activity.agentTurnStartAtMs !== undefined) return;
    activity.agentTurnStartAtMs = startAtMs;
    activity.agentRepository = activity.repository;
  }

  recordSettlement(settlement, notifyError) {
    const activity = this.sessionActivityFor(settlement.sessionId);
    const repository = activity.repository;
    const sourceStartedAtMs = activity.startedAtMs;
    activity.enqueue(
      () => this.humanEntry(settlement, repository, sourceStartedAtMs),
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
    workItemAttribution,
    gitContext,
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
    activity.workItemAttribution = workItemAttribution;
    activity.gitContext = gitContext;
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

  async storageBytes() {
    return this.ledger.storageBytes();
  }

  async pruneEntriesEndingAtOrBefore(cutoffAtMs, dryRun) {
    return this.ledger.pruneEntriesEndingAtOrBefore(cutoffAtMs, dryRun);
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
    const agentWorkItemAttribution = activity.workItemAttribution;
    const agentGitContext = activity.gitContext;
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
          workItemAttribution: agentWorkItemAttribution,
          gitContext: agentGitContext,
        }),
      (entry) => this.ledger.recordAutomatic(entry),
      () => {
        this.lastErrorMessage = undefined;
      },
      (error) => this.reportError(error, notifyError),
    );
  }

  async humanEntry(settlement, repository, sourceStartedAtMs) {
    const stateBeforeSettlement = settlement.stateBeforeSettlement;
    if (
      stateBeforeSettlement.activeStartAtMs === undefined ||
      stateBeforeSettlement.activeUntilMs === undefined
    ) {
      return undefined;
    }
    const resolvedRepository = await (repository ??
      this.repositoryFor(settlement.cwd));
    if (resolvedRepository === undefined) return undefined;
    const entry = createAutomaticTimeLogEntry({
      nowMs: settlement.nowMs,
      repository: resolvedRepository,
      sessionId: settlement.sessionId,
      sourceStartedAtMs:
        sourceStartedAtMs ?? stateBeforeSettlement.activeStartAtMs,
      activity: stateBeforeSettlement.activity,
      narrative: stateBeforeSettlement.narrative,
      workItem: stateBeforeSettlement.workItem,
      gitContext: stateBeforeSettlement.gitContext,
      workItemAttribution:
        stateBeforeSettlement.workItemAttribution ??
        (stateBeforeSettlement.workItem === undefined
          ? "unassigned"
          : "legacy_unknown"),
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
      ...(turn.gitContext === undefined ? {} : { gitContext: turn.gitContext }),
      workItemAttribution:
        turn.workItemAttribution ??
        (turn.workItem === undefined ? "unassigned" : "legacy_unknown"),
      sourceKey: `${turn.sessionId}:${repository.repositoryId}:${turn.startAtMs}:agent:${turn.workItemAttribution ?? (turn.workItem === undefined ? "unassigned" : "legacy_unknown")}:${workItemKey(turn.workItem)}:${gitContextKey(turn.gitContext)}`,
      startAtMs: turn.startAtMs,
      endAtMs: turn.endAtMs,
    };
    return entry;
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

  workItemAttribution;

  gitContext;

  setPromptStart(
    repository,
    startedAtMs,
    activity,
    narrative,
    workItem,
    workItemAttribution,
    gitContext,
  ) {
    this.repository = repository;
    this.startedAtMs = startedAtMs;
    this.activity = activity;
    this.narrative = narrative;
    this.workItem = workItem;
    this.workItemAttribution = workItemAttribution;
    this.gitContext = gitContext;
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
