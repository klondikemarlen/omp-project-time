import path from "node:path";
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
import { extractWorkItem } from "../time-log/domain/work-item.js";
import { buildReport } from "../time-log/domain/report.js";
import {
  clearStatus,
  dashboardText,
  historyText,
  projectDashboardText,
  projectSummaryText,
  reportText,
  summaryText,
  updateStatus,
} from "../extension/status-presenter.js";

const PROJECT_TIME_COMMANDS = [
  {
    value: "summary",
    label: "summary",
    description: "Show active time, prompt count, and last prompt",
  },
  {
    value: "history",
    label: "history",
    description: "Show recent human and agent intervals for this project",
  },
  {
    value: "report",
    label: "report",
    description: "Show concise project-time totals",
  },
];
const PROJECT_OPTION = {
  value: "--project",
  label: "--project",
  description: "View an exact local Project Time project",
};
export class ProjectTimeRuntime {
  pi;

  loadConfig;

  generateActivity;

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
      const selectingProject =
        projectOptionIndex === tokens.length - 1 && prefix.endsWith(" ");
      const current = selectingProject ? "" : (tokens.at(-1) ?? "");
      if (
        !selectingProject &&
        !(projectOptionIndex === tokens.length - 2 && !prefix.endsWith(" "))
      ) {
        return null;
      }
      const base =
        current === ""
          ? prefix.trimEnd()
          : prefix.slice(0, -current.length).trimEnd();
      return this.timeLogRecorder
        .projectNames()
        .filter((project) =>
          project.toLowerCase().startsWith(current.toLowerCase()),
        )
        .map((project) => ({
          value: `${base} ${project}`,
          label: project,
          description: "Local Project Time project",
        }));
    }
    if (tokens.length === 1 && !prefix.endsWith(" ")) {
      return [...PROJECT_TIME_COMMANDS, PROJECT_OPTION].filter(({ value }) =>
        value.startsWith(tokens[0].toLowerCase()),
      );
    }
    if (
      prefix === "" ||
      prefix.endsWith(" ") ||
      tokens.at(-1)?.startsWith("--")
    ) {
      return [{ ...PROJECT_OPTION, value: `${prefix}${PROJECT_OPTION.value}` }];
    }
    return null;
  }

  constructor(pi, options = {}) {
    this.pi = pi;
    this.loadConfig = options.loadConfig ?? loadProjectTimeConfig;
    const dataRoot = defaultProjectTimeDataRoot();
    this.generateActivity = options.generateActivity ?? (async () => ({}));
    this.usesDefaultDataRoot =
      options.prepareLocalData !== undefined ||
      options.timeLogPath === undefined;
    this.timeLogRecorder = new AutomaticTimeLogRecorder(
      options.timeLogPath ?? path.join(dataRoot, "time-log.json"),
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
      description: "Show Project Time status, summary, history, or reports",
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
    const { command, project, tokens } = parsed;
    if (
      command !== "" &&
      command !== "summary" &&
      command !== "history" &&
      !(command === "report" || command.startsWith("report "))
    ) {
      ctx.ui.notify(
        "Unknown Project Time command. Use summary, history, or report.",
        "error",
      );
      return;
    }
    if (command === "report" || command.startsWith("report ")) {
      await this.showReport(tokens, ctx, project);
      return;
    }
    if (project !== undefined) {
      if (command === "history") {
        await this.showHistory(ctx, project);
        return;
      }
      await this.showProjectView(
        ctx,
        project,
        command === "summary" ? "summary" : "dashboard",
      );
      return;
    }
    if (command === "history") {
      await this.showHistory(ctx);
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
    const message =
      command === "summary"
        ? summaryText(settledState, config, sessionName, nowMs)
        : dashboardText(settledState, config, currentProject, sessionName);
    ctx.ui.notify(message, "info");
  }

  async showReport(tokens, ctx, project) {
    try {
      const reportArgs = parseReportArgs(tokens);
      const entries = await this.timeLogRecorder.entries();
      if (reportArgs.mode === "all") {
        const modes = ["raw", "split", "weighted"];
        const human = {};
        const agent = {};
        for (const mode of modes) {
          human[mode] = buildReport(
            entries,
            "human_active",
            mode,
            reportArgs.weights,
            project,
          );
          agent[mode] = buildReport(
            entries,
            "agent_turn_elapsed",
            mode,
            reportArgs.weights,
            project,
          );
        }
        ctx.ui.notify(JSON.stringify({ human, agent }, null, 2), "info");
        return;
      }
      const report = buildReport(
        entries,
        reportArgs.sourceKind,
        reportArgs.mode,
        reportArgs.weights,
        project,
      );
      ctx.ui.notify(
        reportArgs.json ? JSON.stringify(report, null, 2) : reportText(report),
        "info",
      );
    } catch (error) {
      ctx.ui.notify(
        `Project Time report error: ${errorMessage(error)}`,
        "error",
      );
    }
  }

  async showHistory(ctx, project = undefined) {
    try {
      const timeLogEntries = await this.timeLogRecorder.entries();
      if (project !== undefined) {
        const humanEntries = timeLogEntries.filter(
          (entry) =>
            entry.sourceKind === "human_active" && entry.project === project,
        );
        const agentEntries = timeLogEntries.filter(
          (entry) =>
            entry.sourceKind === "agent_turn_elapsed" &&
            entry.project === project,
        );
        ctx.ui.notify(
          historyText(
            project,
            undefined,
            undefined,
            humanEntries,
            agentEntries,
          ),
          "info",
        );
        return;
      }
      const config = await this.loadConfigForStatus(ctx);
      if (config === undefined) return;
      const sessionId = ctx.sessionManager.getSessionId();
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
      const gitRepository = await resolveGitRepository(ctx.cwd);
      const repositoryId = gitRepository?.repositoryId;
      const humanEntries = timeLogEntries.filter(
        (entry) =>
          entry.sourceKind === "human_active" &&
          entry.repositoryId === repositoryId,
      );
      const agentEntries = timeLogEntries.filter(
        (entry) =>
          entry.sourceKind === "agent_turn_elapsed" &&
          entry.repositoryId === repositoryId,
      );
      ctx.ui.notify(
        historyText(
          gitRepository?.project,
          settledState,
          config,
          humanEntries,
          agentEntries,
        ),
        "info",
      );
    } catch (error) {
      ctx.ui.notify(
        `Project Time history error: ${errorMessage(error)}`,
        "error",
      );
    }
  }

  async showProjectView(ctx, project, view) {
    try {
      const entries = await this.timeLogRecorder.entries();
      const projectEntries = entries.filter(
        (entry) => entry.project === project,
      );
      ctx.ui.notify(
        view === "dashboard"
          ? projectDashboardText(project, projectEntries)
          : projectSummaryText(project, projectEntries),
        "info",
      );
    } catch (error) {
      ctx.ui.notify(
        `Project Time ${view} error: ${errorMessage(error)}`,
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
    const generatedActivity = await this.generateActivity(prompt, ctx).catch(
      () => ({}),
    );
    const currentState = this.sessionStateCoordinator.stateFor(
      update.sessionId,
      update.entries,
    );
    const workItem = extractWorkItem(prompt) ?? currentState.workItem;
    const activity =
      parseGeneratedActivityLabel(generatedActivity.activity) ??
      currentState.activity ??
      "General Work";
    const narrative = parseActivityNarrative(generatedActivity.narrative);
    const stateChanged =
      currentState.activity !== activity ||
      currentState.narrative?.text !== narrative?.text ||
      currentState.narrative?.source !== narrative?.source ||
      currentState.workItem?.kind !== workItem?.kind ||
      currentState.workItem?.number !== workItem?.number ||
      currentState.workItem?.repository !== workItem?.repository;
    if (stateChanged) {
      await this.sessionStateCoordinator.setActivity(
        update,
        activity,
        narrative,
        workItem,
      );
    }
    const nextState = await this.sessionStateCoordinator.recordPrompt(update);
    updateStatus(ctx, nextState, config);
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
  if (project === undefined || !/^[A-Za-z0-9._-]+$/.test(project)) {
    throw new Error(
      "Project names use letters, numbers, periods, underscores, and hyphens.",
    );
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

function parseReportArgs(tokens) {
  if (tokens[0] !== "report") throw new Error("Expected a report command.");
  const rest = tokens.slice(1);
  const json = rest[0] === "json";
  if (json) rest.shift();
  let sourceKind = "human_active";
  let sourceWasSpecified = false;
  if (rest[0] === "agent") {
    sourceKind = "agent_turn_elapsed";
    sourceWasSpecified = true;
    rest.shift();
  } else if (rest[0] === "human") {
    sourceWasSpecified = true;
    rest.shift();
  }
  const modeToken = rest[0];
  let mode = json ? "all" : "raw";
  if (
    modeToken === "raw" ||
    modeToken === "split" ||
    modeToken === "weighted" ||
    modeToken === "all"
  ) {
    mode = modeToken;
    rest.shift();
  } else if (modeToken !== undefined) {
    throw new Error(`Unknown report mode: ${modeToken}`);
  }
  if (mode === "all" && !json) {
    throw new Error("Use report json for an all-modes report.");
  }
  if (mode === "all" && sourceWasSpecified) {
    throw new Error("All-modes reports cannot select a source.");
  }
  let weights;
  if (mode === "weighted") {
    const weightsJson = rest.join(" ").trim();
    if (weightsJson.length > 0) {
      try {
        const parsed = JSON.parse(weightsJson);
        if (
          typeof parsed !== "object" ||
          parsed === null ||
          Array.isArray(parsed)
        ) {
          throw new Error("Weights must be a JSON object.");
        }
        weights = {};
        for (const [key, value] of Object.entries(parsed)) {
          if (
            typeof value !== "number" ||
            !Number.isFinite(value) ||
            value <= 0
          ) {
            throw new Error(
              `Weight for ${key} must be a positive finite number.`,
            );
          }
          weights[key] = value;
        }
      } catch {
        throw new Error(
          "Weights must be valid JSON object mapping repository to weight.",
        );
      }
    }
  } else if (rest.length > 0) {
    throw new Error("Only weighted reports accept repository weights.");
  }
  return { sourceKind, mode, json, weights };
}
