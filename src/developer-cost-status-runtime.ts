import {
  parseDeveloperCostConfig,
  recordDeveloperPrompt,
  refreshIntervalMs,
  settleDeveloperCostState,
} from "./billing/index.js"
import type {
  DeveloperCostConfig,
  DeveloperCostState,
} from "./billing/index.js"
import { loadDeveloperCostConfig } from "./load-developer-cost-config.js"
import {
  clearStatus,
  errorMessage,
  statusText,
  updateStatus,
} from "./status-presenter.js"
import {
  DEVELOPER_COST_STATE_ENTRY,
  loadPersistedDeveloperCostState,
} from "./session-state.js"
import { isTopLevelSession } from "./session-classification.js"
import type {
  ConfigLoader,
  ExtensionApi,
  ExtensionContext,
  ExtensionOptions,
} from "./extension-types.js"

const DEFAULT_REFRESH_INTERVAL_MS = refreshIntervalMs(parseDeveloperCostConfig())

type RefreshTimer = NodeJS.Timeout

type RuntimeState = {
  activeContext?: ExtensionContext
  activeSessionId?: string
  refreshTimer?: RefreshTimer
}

export class DeveloperCostStatusRuntime {
  private readonly pi: ExtensionApi
  private readonly loadConfig: ConfigLoader
  private readonly runtimeState: RuntimeState = {}
  private readonly sessionStates = new Map<string, DeveloperCostState>()

  constructor(pi: ExtensionApi, options: ExtensionOptions = {}) {
    this.pi = pi
    this.loadConfig = options.loadConfig ?? loadDeveloperCostConfig
  }

  register(): void {
    this.scheduleNextRefresh()

    this.pi.registerCommand("developer-cost-status", {
      description: "Show the developer cost meter for the current session",
      handler: async (_args, ctx) => {
        await this.showCurrentStatus(ctx)
      },
    })

    this.pi.on("session_start", async (_event, ctx) => {
      await this.activateSession(ctx)
    })

    this.pi.on("session_switch", async (_event, ctx) => {
      await this.activateSession(ctx)
    })

    this.pi.on("before_agent_start", async (_event, ctx) => {
      await this.recordPrompt(ctx)
    })

    this.pi.on("turn_end", async (_event, ctx) => {
      await this.settleCurrentTurn(ctx)
    })

    this.pi.on("session_shutdown", async (_event, ctx) => {
      this.shutdownSession(ctx)
    })
  }

  private async showCurrentStatus(ctx: ExtensionContext): Promise<void> {
    if (!isTopLevelSession(ctx.sessionManager)) {
      ctx.ui.notify("Developer cost status is only tracked for top-level sessions.", "info")
      return
    }

    const config = await this.loadConfigForStatus(ctx)
    if (config === undefined) return

    const sessionId = ctx.sessionManager.getSessionId()
    const state = this.stateForSession(ctx, sessionId)
    const settledState = settleDeveloperCostState(state, Date.now(), config)

    ctx.ui.notify(statusText(settledState, config), "info")
  }

  private async activateSession(ctx: ExtensionContext): Promise<void> {
    if (!isTopLevelSession(ctx.sessionManager)) return

    const config = await this.loadConfigForStatus(ctx)
    if (config === undefined) {
      this.clearActiveStatus(ctx)
      return
    }

    const sessionId = ctx.sessionManager.getSessionId()
    const state = loadPersistedDeveloperCostState(ctx.sessionManager.getEntries())
    const settledState = settleDeveloperCostState(state, Date.now(), config)

    this.sessionStates.set(sessionId, settledState)
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
    const currentState = this.stateForSession(ctx, sessionId)
    const promptAtMs = Date.now()
    const nextState = recordDeveloperPrompt(currentState, promptAtMs, config)

    this.sessionStates.set(sessionId, nextState)
    this.runtimeState.activeContext = ctx
    this.runtimeState.activeSessionId = sessionId

    this.pi.appendEntry(DEVELOPER_COST_STATE_ENTRY, nextState)
    updateStatus(ctx, settleDeveloperCostState(nextState, promptAtMs, config), config)
  }

  private async settleCurrentTurn(ctx: ExtensionContext): Promise<void> {
    if (!isTopLevelSession(ctx.sessionManager)) return

    const config = await this.loadConfigForStatus(ctx)
    if (config === undefined) {
      this.clearActiveStatus(ctx)
      return
    }

    const sessionId = ctx.sessionManager.getSessionId()
    const currentState = this.stateForSession(ctx, sessionId)
    const settledState = settleDeveloperCostState(currentState, Date.now(), config)

    this.sessionStates.set(sessionId, settledState)
    this.pi.appendEntry(DEVELOPER_COST_STATE_ENTRY, settledState)
    this.rememberActiveSession(ctx, sessionId, settledState)
    updateStatus(ctx, settledState, config)
  }

  private shutdownSession(ctx: ExtensionContext): void {
    const sessionId = ctx.sessionManager.getSessionId()
    this.sessionStates.delete(sessionId)
    if (this.runtimeState.activeSessionId !== sessionId) return

    this.clearActiveStatus(ctx)
  }

  private async refreshActiveStatus(): Promise<number> {
    if (
      this.runtimeState.activeContext === undefined ||
      this.runtimeState.activeSessionId === undefined
    ) {
      return DEFAULT_REFRESH_INTERVAL_MS
    }

    const activeContext = this.runtimeState.activeContext
    const activeSessionId = this.runtimeState.activeSessionId
    const config = await this.loadConfigForStatus(activeContext)
    if (config === undefined) {
      this.clearActiveStatus(activeContext)
      return DEFAULT_REFRESH_INTERVAL_MS
    }

    const currentState = this.stateForSession(activeContext, activeSessionId)
    const settledState = settleDeveloperCostState(currentState, Date.now(), config)

    this.sessionStates.set(activeSessionId, settledState)
    this.pi.appendEntry(DEVELOPER_COST_STATE_ENTRY, settledState)
    this.rememberActiveSession(activeContext, activeSessionId, settledState)
    updateStatus(activeContext, settledState, config)

    return refreshIntervalMs(config)
  }

  private scheduleNextRefresh(waitMs = DEFAULT_REFRESH_INTERVAL_MS): void {
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
      `Developer cost status refresh error: ${errorMessage(error)}`,
      "error",
    )
    this.clearActiveStatus(activeContext)
  }

  private async loadConfigForStatus(
    ctx: ExtensionContext,
  ): Promise<DeveloperCostConfig | undefined> {
    try {
      return await this.loadConfig(ctx.cwd)
    } catch (error) {
      ctx.ui.notify(`Developer cost status config error: ${errorMessage(error)}`, "error")
      return undefined
    }
  }

  private rememberActiveSession(
    ctx: ExtensionContext,
    sessionId: string,
    state: DeveloperCostState,
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

  private stateForSession(
    ctx: ExtensionContext,
    sessionId: string,
  ): DeveloperCostState {
    return (
      this.sessionStates.get(sessionId) ??
      loadPersistedDeveloperCostState(ctx.sessionManager.getEntries())
    )
  }
}
