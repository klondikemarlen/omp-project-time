import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";

import { parseProjectTimeConfig } from "@/config/project-time-config.js";
import { errorMessage } from "@/utils/error-message.js";
import { MS_PER_SECOND } from "@/utils/time-constants.js";
import { loadProjectTimeConfig } from "@/config/loader/load-project-time-config.js";
import type { ProjectTimeConfig } from "@/config/project-time-config.js";
import { resolveGitRepository } from "@/infrastructure/git-repository.js";
import { isTopLevelSession } from "@/extension/session-classification.js";
import {
  defaultProjectTimeDataRoot,
  prepareProjectTimeDataRoot,
} from "@/extension/local-data-root.js";
import { SessionStateCoordinator } from "@/extension/application/session-state-coordinator.js";
import { AutomaticTimeLogRecorder } from "@/time-log/recorder.js";
import { parseGeneratedActivityLabel } from "@/time-log/domain/activity.js";
import { parseActivityNarrative } from "@/time-log/domain/narrative.js";
import { resolveWorkItemAssociation } from "@/time-log/domain/work-item.js";
import {
  TIME_LOG_EVIDENCE_FORMAT,
  TIME_LOG_EVIDENCE_VERSION,
} from "@/time-log/infrastructure/state-mapper.js";
import type { ProjectTimeState } from "@/time-log/domain/state.js";
import {
  clearStatus,
  dashboardText,
  projectDashboardText,
  updateStatus,
} from "@/extension/status-presenter.js";
import type {
  ActivityGenerator,
  GeneratedActivity,
  ConfigLoader,
  ExtensionApi,
  ExtensionContext,
  ExtensionOptions,
} from "@/extension/types.js";

type RefreshTimer = NodeJS.Timeout;

type RuntimeState = {
  activeContext?: ExtensionContext;
  activeSessionId?: string;
  refreshTimer?: RefreshTimer;
};


const PROJECT_TIME_COMMANDS = [
  {
    value: "entries",
    label: "entries",
    description: "Export versioned raw Project Time evidence",
  },
] as const;

// ponytail: leave 25 seconds for prompt persistence before OMP's 30-second handler deadline.
const DEFAULT_ACTIVITY_GENERATION_TIMEOUT_MS = 5_000;

const PROJECT_OPTION = {
  value: "--project",
  label: "--project",
  description: "View an exact local Project Time project",
};


function supportsProjectOption(tokens: readonly string[]): boolean {
  return tokens.length === 0 || (tokens.length === 1 && tokens[0] === "entries");
}

export class ProjectTimeRuntime {
  private readonly pi: ExtensionApi;
  private readonly loadConfig: ConfigLoader;
  private readonly generateActivity: ActivityGenerator;
  private readonly activityGenerationTimeoutMs: number;
  private readonly sessionStateCoordinator: SessionStateCoordinator;
  private readonly timeLogRecorder: AutomaticTimeLogRecorder;
  private readonly usesDefaultDataRoot: boolean;
  private readonly prepareLocalData: () => Promise<void>;
  private localDataPreparation: Promise<void> | undefined;
  private readonly runtimeState: RuntimeState = {};

  private static refreshIntervalMs(config: ProjectTimeConfig): number {
    return config.refreshIntervalSeconds * MS_PER_SECOND;
  }

  private static readonly defaultRefreshIntervalMs =
    ProjectTimeRuntime.refreshIntervalMs(parseProjectTimeConfig());

  private projectTimeArgumentCompletions(argumentPrefix: string) {
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

  constructor(pi: ExtensionApi, options: ExtensionOptions = {}) {
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

  register(): void {
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

  private async localDataReady(ctx: ExtensionContext): Promise<boolean> {
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

  private async showCurrentStatus(
    args: string,
    ctx: ExtensionContext,
  ): Promise<void> {
    if (!isTopLevelSession(ctx.sessionManager)) {
      ctx.ui.notify(
        "Project Time is only tracked for top-level sessions.",
        "info",
      );
      return;
    }

    let parsed: ProjectTimeCommand;
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
      ctx.ui.notify(
        "Unknown Project Time command. Use entries.",
        "error",
      );
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

  private async showEntries(
    ctx: ExtensionContext,
    project: string | undefined,
  ): Promise<void> {
    try {
      const entries = await this.timeLogRecorder.entries();
      ctx.ui.notify(
        JSON.stringify(
          {
            format: TIME_LOG_EVIDENCE_FORMAT,
            version: TIME_LOG_EVIDENCE_VERSION,
            entries: project === undefined
              ? entries
              : entries.filter((entry) => entry.project === project),
          },
          null,
          2,
        ),
        "info",
      );
    } catch (error) {
      ctx.ui.notify(
        `Project Time entries error: ${errorMessage(error)}`,
        "error",
      );
    }
  }


  private async showProjectView(
    ctx: ExtensionContext,
    project: string,
  ): Promise<void> {
    try {
      const entries = await this.timeLogRecorder.entries();
      const projectEntries = entries.filter((entry) => entry.project === project);
      ctx.ui.notify(projectDashboardText(project, projectEntries), "info");
    } catch (error) {
      ctx.ui.notify(
        `Project Time dashboard error: ${errorMessage(error)}`,
        "error",
      );
    }
  }

  private async activateSession(ctx: ExtensionContext): Promise<void> {
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

  private async recordPrompt(
    prompt: string,
    ctx: ExtensionContext,
  ): Promise<void> {
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
      notifyTimeLogError: (message: string) =>
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

  private resolveGeneratedActivity(
    prompt: string,
    ctx: ExtensionContext,
  ): Promise<GeneratedActivity> {
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

  private async settleCurrentTurn(ctx: ExtensionContext): Promise<void> {
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

  private async shutdownSession(ctx: ExtensionContext): Promise<void> {
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

  private async refreshActiveStatus(): Promise<number> {
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

  private scheduleNextRefresh(
    waitMs = ProjectTimeRuntime.defaultRefreshIntervalMs,
  ): void {
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

  private reportUnexpectedRefreshError(error: unknown): void {
    const activeContext = this.runtimeState.activeContext;
    if (activeContext === undefined) return;

    activeContext.ui.notify(
      `Project Time refresh error: ${errorMessage(error)}`,
      "error",
    );
    this.clearActiveStatus(activeContext);
  }

  private async loadConfigForStatus(
    ctx: ExtensionContext,
  ): Promise<ProjectTimeConfig | undefined> {
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

  private rememberActiveSession(
    ctx: ExtensionContext,
    sessionId: string,
    state: ProjectTimeState,
  ): void {
    if (state.activeUntilMs === undefined) {
      this.runtimeState.activeContext = undefined;
      this.runtimeState.activeSessionId = undefined;
      return;
    }

    this.runtimeState.activeContext = ctx;
    this.runtimeState.activeSessionId = sessionId;
  }

  private clearActiveStatus(ctx: ExtensionContext): void {
    clearStatus(ctx);
    this.runtimeState.activeContext = undefined;
    this.runtimeState.activeSessionId = undefined;
  }
}

type ProjectTimeCommand = {
  command: string;
  project?: string;
  tokens: string[];
};

function parseProjectTimeCommand(args: string): ProjectTimeCommand {
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

function parseCommandTokens(args: string): string[] {
  const tokens: string[] = [];
  let token = "";
  let quote: "'" | '"' | undefined;
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
