import { describeBillableSession } from "../billable-time/description-generator.js";
import { BillableTimeRecorder } from "../billable-time/recorder.js";
import {
  billableSummaryText,
  billableWorkEntryPreview,
} from "../billable-time/presentation.js";
import { parseDeveloperCostConfig } from "../billing/index.js";
import { MS_PER_SECOND } from "../billing/calculation/time-constants.js";
import { SpreadBillingLedger } from "../billing/infrastructure/spread-ledger.js";
import { loadDeveloperCostConfig } from "../config/loader/load-developer-cost-config.js";
import { AutomaticTimeLogRecorder } from "../time-log/recorder.js";
import { resolveGitRepository } from "../time-log/infrastructure/git-repository.js";
import { errorMessage } from "../utils/error-message.js";
import path from "node:path";
import { isTopLevelSession } from "../extension/session-classification.js";
import {
  defaultProjectTimeDataRoot,
  migrateProjectTimeDataRoot,
  prepareProjectTimeDataRoot,
} from "../extension/local-data-root.js";
import { SessionStateCoordinator } from "../extension/application/session-state-coordinator.js";
import {
  clearStatus,
  dashboardText,
  summaryText,
  updateStatus,
} from "../extension/status-presenter.js";

const PROJECT_TIME_COMMANDS = [
  {
    value: "summary",
    label: "summary",
    description: "Show session cost, active time, and prompt count",
  },
  {
    value: "billable",
    label: "billable",
    description: "Show locally recorded billable clocks",
  },
  {
    value: "billable preview",
    label: "billable preview",
    description: "Preview provider-neutral billable entries",
  },
];
function projectTimeArgumentCompletions(argumentPrefix) {
  const prefix = argumentPrefix.trimStart().toLowerCase();
  return PROJECT_TIME_COMMANDS.filter(({ value }) => value.startsWith(prefix));
}

export class ProjectTimeRuntime {
  pi;

  loadConfig;

  sessionStateCoordinator;

  billableTimeRecorder;

  generateTitle;

  localDataMigration;

  usesDefaultDataRoot;

  migrateLocalData;

  billableSessionIds = new Set();

  runtimeState = {};

  static refreshIntervalMs(config) {
    return config.refreshIntervalSeconds * MS_PER_SECOND;
  }

  static defaultRefreshIntervalMs = ProjectTimeRuntime.refreshIntervalMs(
    parseDeveloperCostConfig(),
  );

  constructor(pi, options = {}) {
    this.pi = pi;
    this.loadConfig = options.loadConfig ?? loadDeveloperCostConfig;
    const dataRoot = defaultProjectTimeDataRoot();
    const usesDefaultDataRoot =
      options.localDataMigration !== undefined ||
      options.ledgerPath === undefined ||
      options.timeLogPath === undefined ||
      options.billableTimePath === undefined;
    const ledger = new SpreadBillingLedger(
      options.ledgerPath ?? path.join(dataRoot, "spread-billing.json"),
    );
    const timeLogRecorder = new AutomaticTimeLogRecorder(
      options.timeLogPath ?? path.join(dataRoot, "time-log.json"),
    );
    this.sessionStateCoordinator = new SessionStateCoordinator(
      ledger,
      timeLogRecorder,
      (customType, data) => this.pi.appendEntry(customType, data),
    );
    this.billableTimeRecorder = new BillableTimeRecorder(
      options.billableTimePath ?? dataRoot,
    );
    this.usesDefaultDataRoot = usesDefaultDataRoot;
    this.migrateLocalData =
      options.localDataMigration ??
      (() =>
        migrateProjectTimeDataRoot().then(() => prepareProjectTimeDataRoot()));
    this.generateTitle = options.generateTitle;
  }

  register() {
    this.scheduleNextRefresh();
    this.pi.registerCommand("project-time", {
      description: "Show Project Time status, summary, or billable records",
      getArgumentCompletions: projectTimeArgumentCompletions,
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
    this.pi.on("before_agent_start", async (_event, ctx) => {
      if (!(await this.localDataReady(ctx))) return;
      await this.recordPrompt(ctx);
    });
    this.pi.on("turn_end", async (_event, ctx) => {
      if (!(await this.localDataReady(ctx))) return;
      await this.settleCurrentTurn(ctx);
    });
    this.pi.on("session_compact", async (event, ctx) => {
      if (!(await this.localDataReady(ctx))) return;
      await this.refreshBillableDescription(
        ctx,
        event.compactionEntry.shortSummary ?? event.compactionEntry.summary,
      );
    });
    this.pi.on("session_shutdown", async (_event, ctx) => {
      if (!(await this.localDataReady(ctx))) return;
      await this.shutdownSession(ctx);
    });
  }

  async localDataReady(ctx) {
    if (!this.usesDefaultDataRoot) return true;
    try {
      this.localDataMigration ??= this.migrateLocalData();
      await this.localDataMigration;
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
    const command = args.trim();
    if (
      command !== "" &&
      !PROJECT_TIME_COMMANDS.some(({ value }) => value === command)
    ) {
      ctx.ui.notify(
        "Unknown Project Time command. Use summary, billable, or billable preview.",
        "error",
      );
      return;
    }
    if (command === "billable preview") {
      try {
        const entries = await this.billableTimeRecorder.workEntries();
        ctx.ui.notify(billableWorkEntryPreview(entries), "info");
      } catch (error) {
        ctx.ui.notify(`Billable time error: ${errorMessage(error)}`, "error");
      }
      return;
    }
    if (command === "billable") {
      try {
        const summaries = await this.billableTimeRecorder.summaries();
        ctx.ui.notify(billableSummaryText(summaries), "info");
      } catch (error) {
        ctx.ui.notify(`Billable time error: ${errorMessage(error)}`, "error");
      }
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
        ctx.ui.notify(`Developer time log error: ${message}`, "error"),
    });
    const project = (await resolveGitRepository(ctx.cwd))?.project;
    const message =
      command === "summary"
        ? summaryText(settledState, config, sessionId, nowMs)
        : dashboardText(settledState, config, project);
    ctx.ui.notify(message, "info");
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
        ctx.ui.notify(`Developer time log error: ${message}`, "error"),
    });
    this.rememberActiveSession(ctx, sessionId, settledState);
    if (settledState.activeUntilMs === undefined) {
      this.clearActiveStatus(ctx);
      return;
    }
    updateStatus(ctx, settledState, config);
  }

  async recordPrompt(ctx) {
    if (!isTopLevelSession(ctx.sessionManager)) return;
    const config = await this.loadConfigForStatus(ctx);
    if (config === undefined) {
      this.clearActiveStatus(ctx);
      return;
    }
    const sessionId = ctx.sessionManager.getSessionId();
    const promptAtMs = Date.now();
    try {
      const result = await this.billableTimeRecorder.recordPrompt(
        sessionId,
        ctx.cwd,
        promptAtMs,
        config.billableTime,
      );
      if (result.started) this.billableSessionIds.add(sessionId);
      if (result.closedInterval)
        await this.recordBillableDescription(ctx, sessionId, false);
    } catch (error) {
      ctx.ui.notify(`Billable time error: ${errorMessage(error)}`, "error");
    }
    const nextState = await this.sessionStateCoordinator.recordPrompt({
      config,
      cwd: ctx.cwd,
      entries: ctx.sessionManager.getEntries(),
      nowMs: promptAtMs,
      sessionId,
      notifyTimeLogError: (message) =>
        ctx.ui.notify(`Developer time log error: ${message}`, "error"),
    });
    updateStatus(ctx, nextState, config);
  }

  async settleCurrentTurn(ctx, closeBillableInterval = true) {
    if (!isTopLevelSession(ctx.sessionManager)) return;
    const sessionId = ctx.sessionManager.getSessionId();
    if (closeBillableInterval) {
      try {
        const closedInterval = await this.billableTimeRecorder.recordTurnEnd(
          sessionId,
          Date.now(),
        );
        if (closedInterval)
          await this.recordBillableDescription(ctx, sessionId, false);
      } catch (error) {
        ctx.ui.notify(`Billable time error: ${errorMessage(error)}`, "error");
      }
    }
    const config = await this.loadConfigForStatus(ctx);
    if (config === undefined) {
      this.clearActiveStatus(ctx);
      return;
    }
    const settledState = await this.sessionStateCoordinator.settle({
      config,
      cwd: ctx.cwd,
      entries: ctx.sessionManager.getEntries(),
      nowMs: Date.now(),
      sessionId,
      notifyTimeLogError: (message) =>
        ctx.ui.notify(`Developer time log error: ${message}`, "error"),
    });
    this.rememberActiveSession(ctx, sessionId, settledState);
    updateStatus(ctx, settledState, config);
  }

  async shutdownSession(ctx) {
    const sessionId = ctx.sessionManager.getSessionId();
    try {
      const closedInterval = await this.billableTimeRecorder.recordShutdown(
        sessionId,
        Date.now(),
      );
      if (closedInterval || this.billableSessionIds.has(sessionId)) {
        await this.recordBillableDescription(ctx, sessionId, true);
      }
    } catch (error) {
      ctx.ui.notify(`Billable time error: ${errorMessage(error)}`, "error");
    }
    if (isTopLevelSession(ctx.sessionManager)) {
      await this.settleCurrentTurn(ctx, false);
    }
    await this.sessionStateCoordinator.flush(sessionId, (message) =>
      ctx.ui.notify(`Developer time log error: ${message}`, "error"),
    );
    this.billableSessionIds.delete(sessionId);
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
        activeContext.ui.notify(
          `Developer time log error: ${message}`,
          "error",
        ),
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

  async refreshBillableDescription(ctx, currentSummary) {
    if (!isTopLevelSession(ctx.sessionManager)) return;
    const sessionId = ctx.sessionManager.getSessionId();
    if (!this.billableSessionIds.has(sessionId)) return;
    try {
      await this.recordBillableDescription(
        ctx,
        sessionId,
        true,
        currentSummary,
      );
    } catch (error) {
      ctx.ui.notify(`Billable time error: ${errorMessage(error)}`, "error");
    }
  }

  async recordBillableDescription(ctx, sessionId, refresh, currentSummary) {
    if (
      !refresh &&
      (await this.billableTimeRecorder.descriptionFor(sessionId)) !== undefined
    )
      return;
    const generationContext = {
      sessionId,
      modelRegistry: ctx.modelRegistry,
      settings: this.pi.pi?.settings,
      model: ctx.model,
      generateTitle: this.generateTitle,
    };
    const description = await describeBillableSession(
      ctx.sessionManager.getHeader(),
      ctx.sessionManager.getBranch?.() ?? ctx.sessionManager.getEntries(),
      generationContext,
      currentSummary,
    );
    await this.billableTimeRecorder.recordDescription({
      ...description,
      sessionId,
      recordedAtMs: Date.now(),
    });
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
