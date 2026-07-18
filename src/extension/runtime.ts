import path from "node:path"

import { parseProjectTimeConfig } from "@/config/project-time-config.js"
import { errorMessage } from "@/utils/error-message.js"
import { MS_PER_SECOND } from "@/utils/time-constants.js"
import { loadProjectTimeConfig } from "@/config/loader/load-project-time-config.js"
import type { ProjectTimeConfig } from "@/config/project-time-config.js"
import { resolveGitRepository } from "@/infrastructure/git-repository.js"
import { isTopLevelSession } from "@/extension/session-classification.js"
import {
  defaultProjectTimeDataRoot,
  prepareProjectTimeDataRoot,
} from "@/extension/local-data-root.js"
import { SessionStateCoordinator } from "@/extension/application/session-state-coordinator.js"
import { AutomaticTimeLogRecorder } from "@/time-log/recorder.js"
import { parseActivityLabel } from "@/time-log/domain/activity.js"
import { buildReport, type AllocationMode } from "@/time-log/domain/report.js"
import type { SourceKind } from "@/time-log/domain/model.js"
import type { ProjectTimeState } from "@/time-log/domain/state.js"
import {
  clearStatus,
  dashboardText,
  historyText,
  reportText,
  summaryText,
  updateStatus,
} from "@/extension/status-presenter.js"
import type {
  ConfigLoader,
  ExtensionApi,
  ExtensionContext,
  ExtensionOptions,
} from "@/extension/types.js"

type RefreshTimer = NodeJS.Timeout

type RuntimeState = {
  activeContext?: ExtensionContext
  activeSessionId?: string
  refreshTimer?: RefreshTimer
}

type ReportArgs = {
  sourceKind: SourceKind
  mode: AllocationMode | "all"
  json: boolean
  weights?: Record<string, number>
}

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
    value: "activity",
    label: "activity",
    description: "Set a coarse label for subsequent intervals",
  },
  {
    value: "report",
    label: "report",
    description: "Show concise project-time totals",
  },
] as const

function projectTimeArgumentCompletions(argumentPrefix: string) {
  const prefix = argumentPrefix.trimStart().toLowerCase()
  return PROJECT_TIME_COMMANDS.filter(({ value }) => value.startsWith(prefix))
}

export class ProjectTimeRuntime {
  private readonly pi: ExtensionApi
  private readonly loadConfig: ConfigLoader
  private readonly sessionStateCoordinator: SessionStateCoordinator
  private readonly timeLogRecorder: AutomaticTimeLogRecorder
  private readonly usesDefaultDataRoot: boolean
  private readonly prepareLocalData: () => Promise<void>
  private localDataPreparation: Promise<void> | undefined
  private readonly runtimeState: RuntimeState = {}

  private static refreshIntervalMs(config: ProjectTimeConfig): number {
    return config.refreshIntervalSeconds * MS_PER_SECOND
  }

  private static readonly defaultRefreshIntervalMs =
    ProjectTimeRuntime.refreshIntervalMs(parseProjectTimeConfig())

  constructor(pi: ExtensionApi, options: ExtensionOptions = {}) {
    this.pi = pi
    this.loadConfig = options.loadConfig ?? loadProjectTimeConfig
    const dataRoot = defaultProjectTimeDataRoot()
    this.usesDefaultDataRoot =
      options.prepareLocalData !== undefined || options.timeLogPath === undefined
    this.timeLogRecorder = new AutomaticTimeLogRecorder(
      options.timeLogPath ?? path.join(dataRoot, "time-log.json"),
    )
    this.sessionStateCoordinator = new SessionStateCoordinator(
      this.timeLogRecorder,
      (customType, data) => this.pi.appendEntry(customType, data),
    )
    this.prepareLocalData = options.prepareLocalData ?? prepareProjectTimeDataRoot
  }

  register(): void {
    this.scheduleNextRefresh()

    this.pi.registerCommand("project-time", {
      description: "Show Project Time status, summary, history, or reports",
      getArgumentCompletions: projectTimeArgumentCompletions,
      handler: async (args, ctx) => {
        if (!await this.localDataReady(ctx)) return
        await this.showCurrentStatus(args, ctx)
      },
    })

    this.pi.on("session_start", async (_event, ctx) => {
      if (!await this.localDataReady(ctx)) return
      await this.activateSession(ctx)
    })

    this.pi.on("session_switch", async (_event, ctx) => {
      if (!await this.localDataReady(ctx)) return
      await this.activateSession(ctx)
    })

    this.pi.on("before_agent_start", async (_event, ctx) => {
      if (!await this.localDataReady(ctx)) return
      await this.recordPrompt(ctx)
    })

    this.pi.on("turn_end", async (_event, ctx) => {
      if (!await this.localDataReady(ctx)) return
      await this.settleCurrentTurn(ctx)
    })

    this.pi.on("session_shutdown", async (_event, ctx) => {
      if (!await this.localDataReady(ctx)) return
      await this.shutdownSession(ctx)
    })
  }

  private async localDataReady(ctx: ExtensionContext): Promise<boolean> {
    if (!this.usesDefaultDataRoot) return true

    try {
      this.localDataPreparation ??= this.prepareLocalData()
      await this.localDataPreparation
      return true
    } catch (error) {
      ctx.ui.notify(errorMessage(error), "error")
      return false
    }
  }

  private async showCurrentStatus(
    args: string,
    ctx: ExtensionContext,
  ): Promise<void> {
    if (!isTopLevelSession(ctx.sessionManager)) {
      ctx.ui.notify("Project Time is only tracked for top-level sessions.", "info")
      return
    }

    const command = args.trim()
    if (command === "activity" || command.startsWith("activity ")) {
      await this.setActivity(command, ctx)
      return
    }

    if (command === "report" || command.startsWith("report ")) {
      await this.showReport(command, ctx)
      return
    }

    if (
      command !== ""
      && !PROJECT_TIME_COMMANDS.some(({ value }) => value === command)
    ) {
      ctx.ui.notify(
        "Unknown Project Time command. Use summary, history, activity, or report.",
        "error",
      )
      return
    }

    const config = await this.loadConfigForStatus(ctx)
    if (config === undefined) return

    if (command === "history") {
      await this.showHistory(ctx, config)
      return
    }

    const sessionId = ctx.sessionManager.getSessionId()
    const sessionName = ctx.sessionManager.getSessionName?.()
    const nowMs = Date.now()
    const settledState = await this.sessionStateCoordinator.settle({
      config,
      cwd: ctx.cwd,
      entries: ctx.sessionManager.getEntries(),
      nowMs,
      sessionId,
      notifyTimeLogError: (message) =>
        ctx.ui.notify(`Project Time log error: ${message}`, "error"),
    })
    const project = (await resolveGitRepository(ctx.cwd))?.project
    const message =
      command === "summary"
        ? summaryText(settledState, config, sessionName, nowMs)
        : dashboardText(settledState, config, project, sessionName)

    ctx.ui.notify(message, "info")
  }

  private async showReport(
    command: string,
    ctx: ExtensionContext,
  ): Promise<void> {
    try {
      const reportArgs = parseReportArgs(command)
      const entries = await this.timeLogRecorder.entries()

      if (reportArgs.mode === "all") {
        const modes: AllocationMode[] = ["raw", "split", "weighted"]
        const human: Record<string, unknown> = {}
        const agent: Record<string, unknown> = {}

        for (const mode of modes) {
          human[mode] = buildReport(
            entries,
            "human_active",
            mode,
            reportArgs.weights,
          )
          agent[mode] = buildReport(
            entries,
            "agent_turn_elapsed",
            mode,
            reportArgs.weights,
          )
        }

        ctx.ui.notify(JSON.stringify({ human, agent }, null, 2), "info")
        return
      }

      const report = buildReport(
        entries,
        reportArgs.sourceKind,
        reportArgs.mode,
        reportArgs.weights,
      )
      ctx.ui.notify(
        reportArgs.json
          ? JSON.stringify(report, null, 2)
          : reportText(report),
        "info",
      )
    } catch (error) {
      ctx.ui.notify(`Project Time report error: ${errorMessage(error)}`, "error")
    }
  }

  private async setActivity(
    command: string,
    ctx: ExtensionContext,
  ): Promise<void> {
    try {
      const activity = parseActivityCommand(command)
      const config = await this.loadConfigForStatus(ctx)
      if (config === undefined) return

      const nowMs = Date.now()
      const nextState = await this.sessionStateCoordinator.setActivity(
        {
          config,
          cwd: ctx.cwd,
          entries: ctx.sessionManager.getEntries(),
          nowMs,
          sessionId: ctx.sessionManager.getSessionId(),
          notifyTimeLogError: (message) =>
            ctx.ui.notify(`Project Time log error: ${message}`, "error"),
        },
        activity,
      )
      updateStatus(ctx, nextState, config)
      ctx.ui.notify(`Activity: ${activity ?? "unlabelled"}`, "info")
    } catch (error) {
      ctx.ui.notify(`Project Time activity error: ${errorMessage(error)}`, "error")
    }
  }

  private async showHistory(
    ctx: ExtensionContext,
    config: ProjectTimeConfig,
  ): Promise<void> {
    try {
      const sessionId = ctx.sessionManager.getSessionId()
      const nowMs = Date.now()
      const settledState = await this.sessionStateCoordinator.settle({
        config,
        cwd: ctx.cwd,
        entries: ctx.sessionManager.getEntries(),
        nowMs,
        sessionId,
        notifyTimeLogError: (message) =>
          ctx.ui.notify(`Project Time log error: ${message}`, "error"),
      })
      const gitRepository = await resolveGitRepository(ctx.cwd)
      const repositoryId = gitRepository?.repositoryId
      const [timeLogEntries] = await Promise.all([this.timeLogRecorder.entries()])
      const humanEntries = timeLogEntries.filter(
        (entry) =>
          entry.sourceKind === "human_active"
          && entry.repositoryId === repositoryId,
      )
      const agentEntries = timeLogEntries.filter(
        (entry) =>
          entry.sourceKind === "agent_turn_elapsed"
          && entry.repositoryId === repositoryId,
      )

      ctx.ui.notify(
        historyText(
          gitRepository?.project,
          settledState,
          config,
          humanEntries,
          agentEntries,
        ),
        "info",
      )
    } catch (error) {
      ctx.ui.notify(`Project Time history error: ${errorMessage(error)}`, "error")
    }
  }

  private async activateSession(ctx: ExtensionContext): Promise<void> {
    if (!isTopLevelSession(ctx.sessionManager)) return

    const config = await this.loadConfigForStatus(ctx)
    if (config === undefined) {
      this.clearActiveStatus(ctx)
      return
    }

    const sessionId = ctx.sessionManager.getSessionId()
    const settledState = await this.sessionStateCoordinator.settle({
      config,
      cwd: ctx.cwd,
      entries: ctx.sessionManager.getEntries(),
      nowMs: Date.now(),
      sessionId,
      notifyTimeLogError: (message) =>
        ctx.ui.notify(`Project Time log error: ${message}`, "error"),
    })
    this.rememberActiveSession(ctx, sessionId, settledState)
    if (settledState.activeUntilMs === undefined) {
      this.clearActiveStatus(ctx)
      return
    }

    updateStatus(ctx, settledState, config)
  }

  private async recordPrompt(ctx: ExtensionContext): Promise<void> {
    if (!isTopLevelSession(ctx.sessionManager)) return

    const config = await this.loadConfigForStatus(ctx)
    if (config === undefined) {
      this.clearActiveStatus(ctx)
      return
    }

    const sessionId = ctx.sessionManager.getSessionId()
    const promptAtMs = Date.now()
    const nextState = await this.sessionStateCoordinator.recordPrompt({
      config,
      cwd: ctx.cwd,
      entries: ctx.sessionManager.getEntries(),
      nowMs: promptAtMs,
      sessionId,
      notifyTimeLogError: (message) =>
        ctx.ui.notify(`Project Time log error: ${message}`, "error"),
    })
    updateStatus(ctx, nextState, config)
  }

  private async settleCurrentTurn(ctx: ExtensionContext): Promise<void> {
    if (!isTopLevelSession(ctx.sessionManager)) return

    const sessionId = ctx.sessionManager.getSessionId()
    const config = await this.loadConfigForStatus(ctx)
    if (config === undefined) {
      this.clearActiveStatus(ctx)
      return
    }

    const nowMs = Date.now()
    this.timeLogRecorder.recordAgentTurnEnd(
      sessionId,
      nowMs,
      (message) => ctx.ui.notify(`Project Time log error: ${message}`, "error"),
    )
    const settledState = await this.sessionStateCoordinator.settle({
      config,
      cwd: ctx.cwd,
      entries: ctx.sessionManager.getEntries(),
      nowMs,
      sessionId,
      notifyTimeLogError: (message) =>
        ctx.ui.notify(`Project Time log error: ${message}`, "error"),
    })
    this.rememberActiveSession(ctx, sessionId, settledState)
    updateStatus(ctx, settledState, config)
  }

  private async shutdownSession(ctx: ExtensionContext): Promise<void> {
    const sessionId = ctx.sessionManager.getSessionId()

    if (isTopLevelSession(ctx.sessionManager)) {
      await this.settleCurrentTurn(ctx)
    }

    await this.sessionStateCoordinator.flush(
      sessionId,
      (message) => ctx.ui.notify(`Project Time log error: ${message}`, "error"),
    )

    if (this.runtimeState.activeSessionId !== sessionId) return

    this.clearActiveStatus(ctx)
  }

  private async refreshActiveStatus(): Promise<number> {
    if (
      this.runtimeState.activeContext === undefined
      || this.runtimeState.activeSessionId === undefined
    ) {
      return ProjectTimeRuntime.defaultRefreshIntervalMs
    }

    const activeContext = this.runtimeState.activeContext
    const activeSessionId = this.runtimeState.activeSessionId
    const config = await this.loadConfigForStatus(activeContext)
    if (config === undefined) {
      this.clearActiveStatus(activeContext)
      return ProjectTimeRuntime.defaultRefreshIntervalMs
    }

    const settledState = await this.sessionStateCoordinator.settle({
      config,
      cwd: activeContext.cwd,
      entries: activeContext.sessionManager.getEntries(),
      nowMs: Date.now(),
      sessionId: activeSessionId,
      notifyTimeLogError: (message) =>
        activeContext.ui.notify(`Project Time log error: ${message}`, "error"),
    })
    this.rememberActiveSession(activeContext, activeSessionId, settledState)
    updateStatus(activeContext, settledState, config)

    return ProjectTimeRuntime.refreshIntervalMs(config)
  }

  private scheduleNextRefresh(
    waitMs = ProjectTimeRuntime.defaultRefreshIntervalMs,
  ): void {
    clearTimeout(this.runtimeState.refreshTimer)

    const timer = setTimeout(async () => {
      this.runtimeState.refreshTimer = undefined
      try {
        const nextWaitMs = await this.refreshActiveStatus()
        this.scheduleNextRefresh(nextWaitMs)
      } catch (error) {
        this.reportUnexpectedRefreshError(error)
        this.scheduleNextRefresh()
      }
    }, waitMs)

    timer.unref?.()
    this.runtimeState.refreshTimer = timer
  }

  private reportUnexpectedRefreshError(error: unknown): void {
    const activeContext = this.runtimeState.activeContext
    if (activeContext === undefined) return

    activeContext.ui.notify(
      `Project Time refresh error: ${errorMessage(error)}`,
      "error",
    )
    this.clearActiveStatus(activeContext)
  }

  private async loadConfigForStatus(
    ctx: ExtensionContext,
  ): Promise<ProjectTimeConfig | undefined> {
    try {
      return await this.loadConfig(ctx.cwd)
    } catch (error) {
      ctx.ui.notify(`Project Time config error: ${errorMessage(error)}`, "error")
      return undefined
    }
  }

  private rememberActiveSession(
    ctx: ExtensionContext,
    sessionId: string,
    state: ProjectTimeState,
  ): void {
    if (state.activeUntilMs === undefined) {
      this.runtimeState.activeContext = undefined
      this.runtimeState.activeSessionId = undefined
      return
    }

    this.runtimeState.activeContext = ctx
    this.runtimeState.activeSessionId = sessionId
  }

  private clearActiveStatus(ctx: ExtensionContext): void {
    clearStatus(ctx)
    this.runtimeState.activeContext = undefined
    this.runtimeState.activeSessionId = undefined
  }
}

function parseReportArgs(command: string): ReportArgs {
  const tokens = command.trim().split(/\s+/)
  if (tokens[0] !== "report") throw new Error("Expected a report command.")

  const rest = tokens.slice(1)
  const json = rest[0] === "json"
  if (json) rest.shift()

  let sourceKind: SourceKind = "human_active"
  let sourceWasSpecified = false
  if (rest[0] === "agent") {
    sourceKind = "agent_turn_elapsed"
    sourceWasSpecified = true
    rest.shift()
  } else if (rest[0] === "human") {
    sourceWasSpecified = true
    rest.shift()
  }

  const modeToken = rest[0]
  let mode: AllocationMode | "all" = json ? "all" : "raw"
  if (
    modeToken === "raw"
    || modeToken === "split"
    || modeToken === "weighted"
    || modeToken === "all"
  ) {
    mode = modeToken
    rest.shift()
  } else if (modeToken !== undefined) {
    throw new Error(`Unknown report mode: ${modeToken}`)
  }

  if (mode === "all" && !json) {
    throw new Error("Use report json for an all-modes report.")
  }

  if (mode === "all" && sourceWasSpecified) {
    throw new Error("All-modes reports cannot select a source.")
  }

  let weights: Record<string, number> | undefined
  if (mode === "weighted") {
    const weightsJson = rest.join(" ").trim()
    if (weightsJson.length > 0) {
      try {
        const parsed = JSON.parse(weightsJson)
        if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
          throw new Error("Weights must be a JSON object.")
        }
        weights = {}
        for (const [key, value] of Object.entries(parsed)) {
          if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
            throw new Error(`Weight for ${key} must be a positive finite number.`)
          }
          weights[key] = value
        }
      } catch {
        throw new Error("Weights must be valid JSON object mapping repository to weight.")
      }
    }
  } else if (rest.length > 0) {
    throw new Error("Only weighted reports accept repository weights.")
  }

  return { sourceKind, mode, json, weights }
}

function parseActivityCommand(command: string): string | undefined {
  const value = command.slice("activity".length).trim()
  if (value === "clear") return undefined

  const activity = parseActivityLabel(value)
  if (activity === undefined) {
    throw new Error(
      "Use 1–48 letters or numbers separated by single spaces or hyphens, or use `activity clear`.",
    )
  }

  return activity
}
