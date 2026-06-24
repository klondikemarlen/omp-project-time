import fs from "node:fs"
import path from "node:path"

import { getPluginSettings } from "@oh-my-pi/pi-coding-agent/extensibility/plugins/loader"

import {
  formatDeveloperCost,
  parseDeveloperCostConfig,
  recordDeveloperPrompt,
  settleDeveloperCostState,
  type DeveloperCostConfig,
  type DeveloperCostOptions,
  type DeveloperCostState,
} from "./billing.js"
import { DEVELOPER_COST_STATE_ENTRY, loadPersistedDeveloperCostState } from "./session-state.js"

const PLUGIN_NAME = "omp-developer-cost-status"
const STATUS_KEY = "developer-cost-status"
const SETTLE_INTERVAL_MS = 15_000

type RuntimeState = {
  activeContext?: ExtensionContext
  activeSessionId?: string
  activeConfig?: DeveloperCostConfig
}

type SessionEntryLike = {
  type?: unknown
  customType?: unknown
  data?: unknown
}

type SessionManagerLike = {
  getSessionId(): string
  getSessionFile(): string | undefined
  getBranch(): SessionEntryLike[]
}

type ThemeLike = {
  fg(color: string, text: string): string
}

type UiLike = {
  notify(message: string, type?: "info" | "warning" | "error"): void
  setStatus(key: string, text: string | undefined): void
  theme: ThemeLike
}

type ExtensionContext = {
  cwd: string
  ui: UiLike
  sessionManager: SessionManagerLike
}

type CommandHandler = (args: string, ctx: ExtensionContext) => Promise<void>

type BeforeAgentStartHandler = (
  event: { prompt: string },
  ctx: ExtensionContext,
) => Promise<void>

type SessionHandler = (
  event: { reason?: string },
  ctx: ExtensionContext,
) => Promise<void>

type TurnEndHandler = (
  event: { type: "turn_end" },
  ctx: ExtensionContext,
) => Promise<void>

type ExtensionApi = {
  registerCommand(
    name: string,
    options: {
      description?: string
      handler: CommandHandler
    },
  ): void
  on(event: "session_start", handler: SessionHandler): void
  on(event: "session_switch", handler: SessionHandler): void
  on(event: "before_agent_start", handler: BeforeAgentStartHandler): void
  on(event: "turn_end", handler: TurnEndHandler): void
  on(event: "session_shutdown", handler: SessionHandler): void
  appendEntry(customType: string, data?: unknown): void
}

export default function developerCostStatusExtension(pi: ExtensionApi) {
  const runtimeState: RuntimeState = {}
  const sessionStates = new Map<string, DeveloperCostState>()

  const timer = setInterval(() => {
    if (
      runtimeState.activeContext === undefined ||
      runtimeState.activeSessionId === undefined ||
      runtimeState.activeConfig === undefined
    ) {
      return
    }

    const currentState = stateForSession(
      sessionStates,
      runtimeState.activeContext,
      runtimeState.activeSessionId,
    )
    const settledState = settleDeveloperCostState(
      currentState,
      Date.now(),
      runtimeState.activeConfig,
    )

    sessionStates.set(runtimeState.activeSessionId, settledState)
    updateStatus(runtimeState.activeContext, settledState, runtimeState.activeConfig)
  }, SETTLE_INTERVAL_MS)

  timer.unref?.()

  pi.registerCommand("developer-cost-status", {
    description: "Show the developer cost meter for the current session",
    handler: async (_args, ctx) => {
      if (!isTopLevelSession(ctx)) {
        ctx.ui.notify("Developer cost status is only tracked for top-level sessions.", "info")
        return
      }

      const config = await loadConfig(ctx)
      const state = stateForSession(sessionStates, ctx, ctx.sessionManager.getSessionId())
      const settledState = settleDeveloperCostState(state, Date.now(), config)

      sessionStates.set(ctx.sessionManager.getSessionId(), settledState)
      ctx.ui.notify(
        `${formatDeveloperCost(settledState.totalCost, config.currencyCode)} (${config.label})`,
        "info",
      )
    },
  })

  pi.on("session_start", async (_event, ctx) => {
    await activateSession(sessionStates, runtimeState, ctx)
  })

  pi.on("session_switch", async (_event, ctx) => {
    await activateSession(sessionStates, runtimeState, ctx)
  })

  pi.on("before_agent_start", async (_event, ctx) => {
    if (!isTopLevelSession(ctx)) {
      clearActiveStatus(runtimeState, ctx)
      return
    }

    const config = await loadConfig(ctx)
    const sessionId = ctx.sessionManager.getSessionId()
    const currentState = stateForSession(sessionStates, ctx, sessionId)
    const promptAtMs = Date.now()
    const nextState = recordDeveloperPrompt(currentState, promptAtMs, config)

    sessionStates.set(sessionId, nextState)
    runtimeState.activeContext = ctx
    runtimeState.activeSessionId = sessionId
    runtimeState.activeConfig = config

    pi.appendEntry(DEVELOPER_COST_STATE_ENTRY, nextState)
    updateStatus(ctx, settleDeveloperCostState(nextState, promptAtMs, config), config)
  })

  pi.on("turn_end", async (_event, ctx) => {
    if (!isTopLevelSession(ctx)) return

    const config = await loadConfig(ctx)
    const sessionId = ctx.sessionManager.getSessionId()
    const currentState = stateForSession(sessionStates, ctx, sessionId)
    const settledState = settleDeveloperCostState(currentState, Date.now(), config)

    sessionStates.set(sessionId, settledState)
    runtimeState.activeContext = ctx
    runtimeState.activeSessionId = sessionId
    runtimeState.activeConfig = config

    updateStatus(ctx, settledState, config)
  })

  pi.on("session_shutdown", async (_event, ctx) => {
    if (runtimeState.activeSessionId !== ctx.sessionManager.getSessionId()) return

    clearActiveStatus(runtimeState, ctx)
  })
}

async function activateSession(
  sessionStates: Map<string, DeveloperCostState>,
  runtimeState: RuntimeState,
  ctx: ExtensionContext,
): Promise<void> {
  if (!isTopLevelSession(ctx)) {
    clearActiveStatus(runtimeState, ctx)
    return
  }

  const config = await loadConfig(ctx)
  const sessionId = ctx.sessionManager.getSessionId()
  const state = loadPersistedDeveloperCostState(ctx.sessionManager.getBranch())
  const settledState = settleDeveloperCostState(state, Date.now(), config)

  sessionStates.set(sessionId, settledState)
  runtimeState.activeContext = ctx
  runtimeState.activeSessionId = sessionId
  runtimeState.activeConfig = config

  updateStatus(ctx, settledState, config)
}

function clearActiveStatus(runtimeState: RuntimeState, ctx: ExtensionContext): void {
  ctx.ui.setStatus(STATUS_KEY, undefined)
  runtimeState.activeContext = undefined
  runtimeState.activeSessionId = undefined
  runtimeState.activeConfig = undefined
}

async function loadConfig(ctx: ExtensionContext): Promise<DeveloperCostConfig> {
  const settings = await getPluginSettings(PLUGIN_NAME, ctx.cwd)

  return parseDeveloperCostConfig(settings as DeveloperCostOptions)
}

function isTopLevelSession(ctx: ExtensionContext): boolean {
  const sessionFile = ctx.sessionManager.getSessionFile()
  if (sessionFile === undefined) return true

  return !fs.existsSync(`${path.dirname(sessionFile)}.jsonl`)
}

function stateForSession(
  sessionStates: Map<string, DeveloperCostState>,
  ctx: ExtensionContext,
  sessionId: string,
): DeveloperCostState {
  return sessionStates.get(sessionId) ?? loadPersistedDeveloperCostState(ctx.sessionManager.getBranch())
}

function updateStatus(
  ctx: ExtensionContext,
  state: DeveloperCostState,
  config: DeveloperCostConfig,
): void {
  const text = formatDeveloperCost(state.totalCost, config.currencyCode)
  ctx.ui.setStatus(STATUS_KEY, ctx.ui.theme.fg("dim", `${text} (${config.label})`))
}
