import { clearStatus, updateStatus } from "../extension/status-presenter.js";
import {
  PROJECT_TIME_LIVE_EVENT,
  PROJECT_TIME_LIVE_REQUEST_EVENT,
} from "../extension/types.js";
import { liveTimeTotals } from "../time-log/domain/live-totals.js";

function parseLiveRequest(value) {
  if (typeof value !== "object" || value === null) return undefined;
  const candidate = value;
  if (
    typeof candidate.sessionId !== "string" ||
    candidate.sessionId.trim() === ""
  ) {
    return undefined;
  }
  if (candidate.presentation === undefined) {
    return { sessionId: candidate.sessionId };
  }
  if (candidate.presentation !== "worklog") return undefined;
  return {
    sessionId: candidate.sessionId,
    presentation: "worklog",
  };
}

function humanIntervalAtObservation(state, observedAtMs) {
  const activeStartAtMs = state.activeStartAtMs;
  const activeUntilMs = state.activeUntilMs;
  if (
    activeStartAtMs === undefined ||
    activeUntilMs === undefined ||
    !Number.isFinite(activeStartAtMs) ||
    !Number.isFinite(activeUntilMs) ||
    activeStartAtMs > observedAtMs ||
    activeUntilMs <= observedAtMs
  ) {
    return { active: false };
  }
  const intervalStartAtMs = Math.max(
    activeStartAtMs,
    state.lastSettledAtMs ?? activeStartAtMs,
    state.activityStartedAtMs ?? activeStartAtMs,
  );
  const intervalEndAtMs = Math.min(activeUntilMs, observedAtMs);
  if (intervalStartAtMs > intervalEndAtMs) return { active: false };
  return {
    active: true,
    interval: {
      startAtMs: intervalStartAtMs,
      endAtMs: intervalEndAtMs,
    },
  };
}

export class LiveSnapshotCoordinator {
  events;

  timeLogRecorder;

  sessionStateCoordinator;

  selectedContext;

  isCurrentSession;

  observeInOrder;

  activateSession;

  worklogPresentationSessions = new Set();

  constructor(options) {
    this.events = options.events;
    this.timeLogRecorder = options.timeLogRecorder;
    this.sessionStateCoordinator = options.sessionStateCoordinator;
    this.selectedContext = options.selectedContext;
    this.isCurrentSession = options.isCurrentSession;
    this.observeInOrder = options.observeInOrder;
    this.activateSession = options.activateSession;
  }

  register() {
    this.events.on(PROJECT_TIME_LIVE_REQUEST_EVENT, async (data) => {
      const request = parseLiveRequest(data);
      if (request === undefined) return;
      await this.observeInOrder(() => this.handleRequest(request));
    });
  }

  selectSession(sessionId) {
    for (const ownedSessionId of this.worklogPresentationSessions) {
      if (ownedSessionId !== sessionId) {
        this.worklogPresentationSessions.delete(ownedSessionId);
      }
    }
  }

  releaseSession(sessionId) {
    this.worklogPresentationSessions.delete(sessionId);
  }

  renderStatus(context, sessionId, state, config) {
    if (this.worklogPresentationSessions.has(sessionId)) {
      clearStatus(context);
      return;
    }
    updateStatus(context, state, config);
  }

  emitUnavailable(sessionId, observedAtMs, project, context) {
    if (context !== undefined && !this.isCurrentSession(context, sessionId)) {
      return;
    }
    const snapshot = {
      version: 1,
      sessionId,
      ...(project === undefined ? {} : { project }),
      humanActive: false,
      agentActive: false,
      observedAtMs,
    };
    this.events.emit(PROJECT_TIME_LIVE_EVENT, snapshot);
  }

  async publish(context, sessionId, observedAtMs) {
    if (!this.isCurrentSession(context, sessionId)) return;
    let project;
    let snapshot;
    try {
      const repository = await this.timeLogRecorder.repositoryFor(context.cwd);
      if (!this.isCurrentSession(context, sessionId)) return;
      project = repository?.project;
      if (project === undefined || project.trim() === "") {
        throw new Error("Current Project Time project is unavailable.");
      }
      const sessionEntries = context.sessionManager.getEntries();
      const state = this.sessionStateCoordinator.stateFor(
        sessionId,
        sessionEntries,
      );
      let writeFailed = false;
      await this.timeLogRecorder.drain(sessionId, () => {
        writeFailed = true;
      });
      if (writeFailed) {
        throw new Error("Project Time evidence could not be fully read.");
      }
      const entries = await this.timeLogRecorder.entriesForSessionAndProject(
        sessionId,
        project,
      );
      const openAgent = await this.timeLogRecorder.openAgentInterval(sessionId);
      if (!this.isCurrentSession(context, sessionId)) return;
      const openHuman = humanIntervalAtObservation(state, observedAtMs);
      const openAgentInProject =
        openAgent !== undefined &&
        openAgent.project === project &&
        Number.isFinite(openAgent.startAtMs) &&
        openAgent.startAtMs <= observedAtMs
          ? {
              startAtMs: openAgent.startAtMs,
              endAtMs: observedAtMs,
            }
          : undefined;
      const totals = liveTimeTotals(
        entries,
        sessionId,
        project,
        observedAtMs,
        openHuman.interval,
        openAgentInProject,
      );
      if (totals === undefined) {
        throw new Error("Project Time live totals are unavailable.");
      }
      snapshot = {
        version: 1,
        sessionId,
        project,
        humanMilliseconds: totals.humanMilliseconds,
        agentMilliseconds: totals.agentMilliseconds,
        humanActive: openHuman.active,
        agentActive: openAgentInProject !== undefined,
        observedAtMs,
      };
    } catch {
      this.emitUnavailable(sessionId, observedAtMs, project, context);
      return;
    }
    if (!this.isCurrentSession(context, sessionId)) return;
    this.events.emit(PROJECT_TIME_LIVE_EVENT, snapshot);
  }

  async handleRequest(request) {
    const nowMs = Date.now();
    if (request.presentation === undefined) {
      const selected = this.selectedContext();
      if (
        selected === undefined ||
        !this.isCurrentSession(selected.context, request.sessionId)
      ) {
        return;
      }
      this.worklogPresentationSessions.delete(request.sessionId);
      await this.activateSession(selected.context, nowMs, request.sessionId);
      return;
    }
    const selected = this.selectedContext();
    if (selected === undefined) {
      this.worklogPresentationSessions.add(request.sessionId);
      this.emitUnavailable(request.sessionId, nowMs);
      return;
    }
    if (!this.isCurrentSession(selected.context, request.sessionId)) return;
    this.worklogPresentationSessions.add(request.sessionId);
    clearStatus(selected.context);
    await this.publish(selected.context, request.sessionId, nowMs);
  }
}
