import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { parseProjectTimeConfig } from "../config/project-time-config.js";
import { errorMessage } from "../utils/error-message.js";
import { MS_PER_SECOND } from "../utils/time-constants.js";
import { loadProjectTimeConfig } from "../config/loader/load-project-time-config.js";
import { resolveGitRepository } from "../infrastructure/git-repository.js";
import { isTopLevelSession } from "../extension/session-classification.js";
import {
  defaultProjectTimeDataRoot,
  prepareProjectTimeDataRoot,
} from "../extension/local-data-root.js";
import { SessionStateCoordinator } from "../extension/application/session-state-coordinator.js";
import { AutomaticTimeLogRecorder } from "../time-log/recorder.js";
import { parseGeneratedActivityLabel } from "../time-log/domain/activity.js";
import { parseActivityNarrative } from "../time-log/domain/narrative.js";
import { resolveWorkItemAssociation } from "../time-log/domain/work-item.js";
import {
  clearStatus,
  dashboardText,
  projectDashboardText,
  updateStatus,
} from "../extension/status-presenter.js";

const PROJECT_TIME_COMMANDS = [
  {
    value: "entries",
    label: "entries",
    description: "Export versioned raw Project Time evidence",
  },
];
// ponytail: leave 25 seconds for prompt persistence before OMP's 30-second handler deadline.
const DEFAULT_ACTIVITY_GENERATION_TIMEOUT_MS = 5_000;
const PROJECT_OPTION = {
  value: "--project",
  label: "--project",
  description: "View an exact local Project Time project",
};
const EVIDENCE_PREVIEW_ENTRY_LIMIT = 3;
const PROJECT_TIME_EVIDENCE_WIDGET = "project-time-evidence";
function evidencePreviewLines(entries, project) {
  const selectedEntries =
    project === undefined
      ? entries
      : entries.filter((entry) => entry.project === project);
  const command =
    project === undefined
      ? "project-time entries"
      : `project-time entries --project ${JSON.stringify(project)}`;
  const visibleEntries =
    selectedEntries.length <= EVIDENCE_PREVIEW_ENTRY_LIMIT
      ? selectedEntries
      : [...selectedEntries.slice(0, 2), ...selectedEntries.slice(-1)];
  const hiddenEntries = selectedEntries.length - visibleEntries.length;
  const entryLines = visibleEntries.map(
    ({ activity, id, project: entryProject, sourceKind }) =>
      `${sourceKind} · ${entryProject} · ${activity ?? "No activity"} · ${id}`,
  );
  return [
    "Project Time evidence",
    `Entries: ${selectedEntries.length}${project === undefined ? "" : ` · ${project}`}`,
    "",
    ...entryLines.slice(0, 2),
    ...(hiddenEntries === 0 ? [] : [`… ${hiddenEntries} entries hidden`]),
    ...entryLines.slice(2),
    "",
    `Complete JSON: ${command}`,
    "/project-time clears this preview",
  ];
}

function supportsProjectOption(tokens) {
  return (
    tokens.length === 0 || (tokens.length === 1 && tokens[0] === "entries")
  );
}

export class ProjectTimeRuntime {
  pi;

  loadConfig;

  generateActivity;

  activityGenerationTimeoutMs;

  sessionStateCoordinator;

  timeLogRecorder;

  usesDefaultDataRoot;

  prepareLocalData;

  localDataPreparation;

  runtimeState = {};

  static refreshIntervalMs(config) {
    return config.refreshIntervalSeconds * MS_PER_SECOND;
  }

  static defaultRefreshIntervalMs = ProjectTimeRuntime.refreshIntervalMs(
    parseProjectTimeConfig(),
  );

  projectTimeArgumentCompletions(argumentPrefix) {
    const prefix = argumentPrefix.trimStart();
    const tokens = prefix.trim().split(/\s+/);
    const projectOptionIndex = tokens.indexOf("--project");
    if (projectOptionIndex !== -1) {
      const baseTokens = tokens.slice(0, projectOptionIndex);
      if (!supportsProjectOption(baseTokens)) return null;
      const valueStart = prefix.indexOf("--project") + "--project".length;
      const entered = prefix.slice(valueStart);
      if (/\s--/.test(entered)) return null;
      if (!prefix.endsWith(" ") && entered.trim() === "") return null;
      const current = entered.trim().replace(/^['"]/, "");
      const base = prefix.slice(0, valueStart).trimEnd();
      return this.timeLogRecorder
        .projectNames()
        .filter((project) =>
          project.toLowerCase().startsWith(current.toLowerCase()),
        )
        .map((project) => ({
          value: `${base} ${/^[^\s"'\\]+$/.test(project) ? project : JSON.stringify(project)}`,
          label: project,
          description: "Local Project Time project",
        }));
    }
    if (tokens.length === 1 && !prefix.endsWith(" ")) {
      const choices = tokens[0].startsWith("--")
        ? [PROJECT_OPTION]
        : PROJECT_TIME_COMMANDS;
      return choices.filter(({ value }) =>
        value.startsWith(tokens[0].toLowerCase()),
      );
    }
    const currentIsFlagPrefix =
      !prefix.endsWith(" ") && tokens.at(-1)?.startsWith("--");
    const commandTokens = currentIsFlagPrefix ? tokens.slice(0, -1) : tokens;
    if (
      supportsProjectOption(commandTokens) &&
      (prefix.endsWith(" ") || currentIsFlagPrefix)
    ) {
      const value = currentIsFlagPrefix
        ? `${prefix.slice(0, -(tokens.at(-1)?.length ?? 0))}${PROJECT_OPTION.value}`
        : `${prefix}${PROJECT_OPTION.value}`;
      return [{ ...PROJECT_OPTION, value }];
    }
    return null;
  }

  constructor(pi, options = {}) {
    this.pi = pi;
    this.loadConfig = options.loadConfig ?? loadProjectTimeConfig;
    const dataRoot = defaultProjectTimeDataRoot();
    this.generateActivity = options.generateActivity ?? (async () => ({}));
    this.activityGenerationTimeoutMs =
      options.activityGenerationTimeoutMs ??
      DEFAULT_ACTIVITY_GENERATION_TIMEOUT_MS;
    this.usesDefaultDataRoot =
      options.prepareLocalData !== undefined ||
      options.timeLogPath === undefined;
    this.timeLogRecorder = new AutomaticTimeLogRecorder(
      options.timeLogPath ?? path.join(dataRoot, "time-log.sqlite"),
      options.timeLogPath === undefined
        ? path.join(dataRoot, "time-log.json")
        : undefined,
    );
    this.sessionStateCoordinator = new SessionStateCoordinator(
      this.timeLogRecorder,
      (customType, data) => this.pi.appendEntry(customType, data),
    );
    this.prepareLocalData =
      options.prepareLocalData ?? prepareProjectTimeDataRoot;
  }

  register() {
    this.scheduleNextRefresh();
    this.pi.registerCommand("project-time", {
      description: "Show Project Time status or export raw evidence",
      getArgumentCompletions: (prefix) =>
        this.projectTimeArgumentCompletions(prefix),
      handler: async (args, ctx) => {
        if (!(await this.localDataReady(ctx))) return;
        await this.showCurrentStatus(args, ctx);
      },
    });
    this.pi.on("session_start", async (_event, ctx) => {
      if (!(await this.localDataReady(ctx))) return;
      await this.activateSession(ctx);
    });
    this.pi.on("session_switch", async (_event, ctx) => {
      if (!(await this.localDataReady(ctx))) return;
      await this.activateSession(ctx);
    });
    this.pi.on("before_agent_start", async (event, ctx) => {
      if (!(await this.localDataReady(ctx))) return;
      await this.recordPrompt(event.prompt, ctx);
    });
    this.pi.on("turn_end", async (_event, ctx) => {
      if (!(await this.localDataReady(ctx))) return;
      await this.settleCurrentTurn(ctx);
    });
    this.pi.on("session_shutdown", async (_event, ctx) => {
      if (!(await this.localDataReady(ctx))) return;
      await this.shutdownSession(ctx);
    });
  }

  async localDataReady(ctx) {
    if (!this.usesDefaultDataRoot) return true;
    try {
      this.localDataPreparation ??= this.prepareLocalData();
      await this.localDataPreparation;
      return true;
    } catch (error) {
      ctx.ui.notify(errorMessage(error), "error");
      return false;
    }
  }

  async showCurrentStatus(args, ctx) {
    if (!isTopLevelSession(ctx.sessionManager)) {
      ctx.ui.notify(
        "Project Time is only tracked for top-level sessions.",
        "info",
      );
      return;
    }
    ctx.ui.setWidget?.(PROJECT_TIME_EVIDENCE_WIDGET, undefined);
    let parsed;
    try {
      parsed = parseProjectTimeCommand(args);
    } catch (error) {
      ctx.ui.notify(
        `Project Time command error: ${errorMessage(error)}`,
        "error",
      );
      return;
    }
    const { command, project } = parsed;
    if (command !== "" && command !== "entries") {
      ctx.ui.notify("Unknown Project Time command. Use entries.", "error");
      return;
    }
    if (command === "entries") {
      await this.showEntries(ctx, project);
      return;
    }
    if (project !== undefined) {
      await this.showProjectView(ctx, project);
      return;
    }
    const config = await this.loadConfigForStatus(ctx);
    if (config === undefined) return;
    const sessionId = ctx.sessionManager.getSessionId();
    const sessionName = ctx.sessionManager.getSessionName?.();
    const nowMs = Date.now();
    const settledState = await this.sessionStateCoordinator.settle({
      config,
      cwd: ctx.cwd,
      entries: ctx.sessionManager.getEntries(),
      nowMs,
      sessionId,
      notifyTimeLogError: (message) =>
        ctx.ui.notify(`Project Time log error: ${message}`, "error"),
    });
    const currentProject = (await resolveGitRepository(ctx.cwd))?.project;
    ctx.ui.notify(
      dashboardText(settledState, config, currentProject, sessionName),
      "info",
    );
  }

  async showEntries(ctx, project) {
    try {
      const entries = await this.timeLogRecorder.entries();
      const preview = evidencePreviewLines(entries, project);
      if (ctx.ui.setWidget === undefined) {
        ctx.ui.notify(preview.join("\n"), "info");
        return;
      }
      ctx.ui.setWidget(PROJECT_TIME_EVIDENCE_WIDGET, preview);
    } catch (error) {
      ctx.ui.notify(
        `Project Time entries error: ${errorMessage(error)}`,
        "error",
      );
    }
  }

  async showProjectView(ctx, project) {
    try {
      const entries = await this.timeLogRecorder.entries();
      const projectEntries = entries.filter(
        (entry) => entry.project === project,
      );
      ctx.ui.notify(projectDashboardText(project, projectEntries), "info");
    } catch (error) {
      ctx.ui.notify(
        `Project Time dashboard error: ${errorMessage(error)}`,
        "error",
      );
    }
  }

  async activateSession(ctx) {
    if (!isTopLevelSession(ctx.sessionManager)) return;
    const config = await this.loadConfigForStatus(ctx);
    if (config === undefined) {
      this.clearActiveStatus(ctx);
      return;
    }
    const sessionId = ctx.sessionManager.getSessionId();
    const settledState = await this.sessionStateCoordinator.settle({
      config,
      cwd: ctx.cwd,
      entries: ctx.sessionManager.getEntries(),
      nowMs: Date.now(),
      sessionId,
      notifyTimeLogError: (message) =>
        ctx.ui.notify(`Project Time log error: ${message}`, "error"),
    });
    this.rememberActiveSession(ctx, sessionId, settledState);
    if (settledState.activeUntilMs === undefined) {
      this.clearActiveStatus(ctx);
      return;
    }
    updateStatus(ctx, settledState, config);
  }

  async recordPrompt(prompt, ctx) {
    if (!isTopLevelSession(ctx.sessionManager)) return;
    const config = await this.loadConfigForStatus(ctx);
    if (config === undefined) {
      this.clearActiveStatus(ctx);
      return;
    }
    const promptAtMs = Date.now();
    const update = {
      config,
      cwd: ctx.cwd,
      entries: ctx.sessionManager.getEntries(),
      nowMs: promptAtMs,
      sessionId: ctx.sessionManager.getSessionId(),
      notifyTimeLogError: (message) =>
        ctx.ui.notify(`Project Time log error: ${message}`, "error"),
    };
    const generatedActivity = await this.resolveGeneratedActivity(prompt, ctx);
    const currentState = this.sessionStateCoordinator.stateFor(
      update.sessionId,
      update.entries,
    );
    const { workItem, workItemAttribution } = resolveWorkItemAssociation(
      prompt,
      currentState.workItem,
    );
    const activity = parseGeneratedActivityLabel(generatedActivity.activity);
    const narrative = parseActivityNarrative(generatedActivity.narrative);
    const stateChanged =
      currentState.activity !== activity ||
      currentState.narrative?.text !== narrative?.text ||
      currentState.narrative?.source !== narrative?.source ||
      currentState.workItem?.kind !== workItem?.kind ||
      currentState.workItem?.number !== workItem?.number ||
      currentState.workItem?.repository !== workItem?.repository ||
      currentState.workItemAttribution !== workItemAttribution;
    if (stateChanged) {
      await this.sessionStateCoordinator.setActivity(
        update,
        activity,
        narrative,
        workItem,
        workItemAttribution,
      );
    }
    const nextState = await this.sessionStateCoordinator.recordPrompt(update);
    updateStatus(ctx, nextState, config);
  }

  resolveGeneratedActivity(prompt, ctx) {
    const activityContext = this.timeLogRecorder
      .repositoryFor(ctx.cwd)
      .then((repository) =>
        repository === undefined
          ? undefined
          : {
              project: repository.project,
              ...(repository.repositoryIdentity === undefined
                ? {}
                : { repositoryIdentity: repository.repositoryIdentity }),
            },
      );
    const timeoutController = new AbortController();
    const generatedActivity = activityContext
      .then((context) => this.generateActivity(prompt, ctx, context))
      .catch(() => ({}));
    const timeout = delay(this.activityGenerationTimeoutMs, undefined, {
      signal: timeoutController.signal,
    }).then(() => ({}));
    return Promise.race([generatedActivity, timeout]).finally(() =>
      timeoutController.abort(),
    );
  }

  async settleCurrentTurn(ctx) {
    if (!isTopLevelSession(ctx.sessionManager)) return;
    const sessionId = ctx.sessionManager.getSessionId();
    const config = await this.loadConfigForStatus(ctx);
    if (config === undefined) {
      this.clearActiveStatus(ctx);
      return;
    }
    const nowMs = Date.now();
    this.timeLogRecorder.recordAgentTurnEnd(sessionId, nowMs, (message) =>
      ctx.ui.notify(`Project Time log error: ${message}`, "error"),
    );
    const settledState = await this.sessionStateCoordinator.settle({
      config,
      cwd: ctx.cwd,
      entries: ctx.sessionManager.getEntries(),
      nowMs,
      sessionId,
      notifyTimeLogError: (message) =>
        ctx.ui.notify(`Project Time log error: ${message}`, "error"),
    });
    this.rememberActiveSession(ctx, sessionId, settledState);
    updateStatus(ctx, settledState, config);
  }

  async shutdownSession(ctx) {
    const sessionId = ctx.sessionManager.getSessionId();
    if (isTopLevelSession(ctx.sessionManager)) {
      await this.settleCurrentTurn(ctx);
    }
    await this.sessionStateCoordinator.flush(sessionId, (message) =>
      ctx.ui.notify(`Project Time log error: ${message}`, "error"),
    );
    if (this.runtimeState.activeSessionId !== sessionId) return;
    this.clearActiveStatus(ctx);
  }

  async refreshActiveStatus() {
    if (
      this.runtimeState.activeContext === undefined ||
      this.runtimeState.activeSessionId === undefined
    ) {
      return ProjectTimeRuntime.defaultRefreshIntervalMs;
    }
    const activeContext = this.runtimeState.activeContext;
    const activeSessionId = this.runtimeState.activeSessionId;
    const config = await this.loadConfigForStatus(activeContext);
    if (config === undefined) {
      this.clearActiveStatus(activeContext);
      return ProjectTimeRuntime.defaultRefreshIntervalMs;
    }
    const settledState = await this.sessionStateCoordinator.settle({
      config,
      cwd: activeContext.cwd,
      entries: activeContext.sessionManager.getEntries(),
      nowMs: Date.now(),
      sessionId: activeSessionId,
      notifyTimeLogError: (message) =>
        activeContext.ui.notify(`Project Time log error: ${message}`, "error"),
    });
    this.rememberActiveSession(activeContext, activeSessionId, settledState);
    updateStatus(activeContext, settledState, config);
    return ProjectTimeRuntime.refreshIntervalMs(config);
  }

  scheduleNextRefresh(waitMs = ProjectTimeRuntime.defaultRefreshIntervalMs) {
    clearTimeout(this.runtimeState.refreshTimer);
    const timer = setTimeout(async () => {
      this.runtimeState.refreshTimer = undefined;
      try {
        const nextWaitMs = await this.refreshActiveStatus();
        this.scheduleNextRefresh(nextWaitMs);
      } catch (error) {
        this.reportUnexpectedRefreshError(error);
        this.scheduleNextRefresh();
      }
    }, waitMs);
    timer.unref?.();
    this.runtimeState.refreshTimer = timer;
  }

  reportUnexpectedRefreshError(error) {
    const activeContext = this.runtimeState.activeContext;
    if (activeContext === undefined) return;
    activeContext.ui.notify(
      `Project Time refresh error: ${errorMessage(error)}`,
      "error",
    );
    this.clearActiveStatus(activeContext);
  }

  async loadConfigForStatus(ctx) {
    try {
      return await this.loadConfig(ctx.cwd);
    } catch (error) {
      ctx.ui.notify(
        `Project Time config error: ${errorMessage(error)}`,
        "error",
      );
      return undefined;
    }
  }

  rememberActiveSession(ctx, sessionId, state) {
    if (state.activeUntilMs === undefined) {
      this.runtimeState.activeContext = undefined;
      this.runtimeState.activeSessionId = undefined;
      return;
    }
    this.runtimeState.activeContext = ctx;
    this.runtimeState.activeSessionId = sessionId;
  }

  clearActiveStatus(ctx) {
    clearStatus(ctx);
    this.runtimeState.activeContext = undefined;
    this.runtimeState.activeSessionId = undefined;
  }
}

function parseProjectTimeCommand(args) {
  const tokens = parseCommandTokens(args);
  const projectIndexes = tokens
    .map((token, index) => (token === "--project" ? index : -1))
    .filter((index) => index !== -1);
  if (projectIndexes.length === 0) {
    return { command: tokens.join(" "), tokens };
  }
  const projectIndex = projectIndexes[0];
  if (projectIndexes.length !== 1 || projectIndex !== tokens.length - 2) {
    throw new Error("Use --project NAME once at the end of the command.");
  }
  const project = tokens.at(-1);
  if (project === undefined || project.trim() === "") {
    throw new Error("Project names must not be blank.");
  }
  const commandTokens = tokens.slice(0, -2);
  return { command: commandTokens.join(" "), project, tokens: commandTokens };
}

function parseCommandTokens(args) {
  const tokens = [];
  let token = "";
  let quote;
  let escaped = false;
  for (const character of args.trim()) {
    if (escaped) {
      token += character;
      escaped = false;
    } else if (character === "\\" && quote !== "'") {
      escaped = true;
    } else if (quote !== undefined) {
      if (character === quote) quote = undefined;
      else token += character;
    } else if (character === "'" || character === '"') {
      quote = character;
    } else if (/\s/.test(character)) {
      if (token !== "") {
        tokens.push(token);
        token = "";
      }
    } else {
      token += character;
    }
  }
  if (quote !== undefined || escaped)
    throw new Error("Use closed quoted arguments.");
  if (token !== "") tokens.push(token);
  return tokens;
}
