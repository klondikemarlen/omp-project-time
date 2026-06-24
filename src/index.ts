import fs from "node:fs"
import { homedir } from "node:os"
import path from "node:path"
import {
  displayedDeveloperCost,
  formatDeveloperCost,
  parseDeveloperCostConfig,
  recordDeveloperPrompt,
  refreshIntervalMs,
  settleDeveloperCostState,
  type DeveloperCostConfig,
  type DeveloperCostOptions,
  type DeveloperCostState,
} from "./billing.js"
import { DEVELOPER_COST_STATE_ENTRY, loadPersistedDeveloperCostState } from "./session-state.js"

const PLUGIN_NAME = "omp-developer-cost-status"
const STATUS_KEY = "developer-cost-status"
const DEFAULT_REFRESH_INTERVAL_MS = refreshIntervalMs(parseDeveloperCostConfig())

type RuntimeState = {
  activeContext?: ExtensionContext
  activeSessionId?: string
  activeConfig?: DeveloperCostConfig
}

type PluginSettingsByName = Record<string, Record<string, unknown>>

type PluginRuntimeConfig = {
  settings?: PluginSettingsByName
}

type ProjectPluginOverrides = {
  settings?: PluginSettingsByName
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

  const scheduleNextRefresh = (waitMs = DEFAULT_REFRESH_INTERVAL_MS): void => {
    const timer = setTimeout(async () => {
      const nextWaitMs = await refreshActiveStatus(sessionStates, runtimeState)
      scheduleNextRefresh(nextWaitMs)
    }, waitMs)

    timer.unref?.()
  }

  scheduleNextRefresh()

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

      ctx.ui.notify(statusText(settledState, Date.now(), config), "info")
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

async function refreshActiveStatus(
  sessionStates: Map<string, DeveloperCostState>,
  runtimeState: RuntimeState,
): Promise<number> {
  if (
    runtimeState.activeContext === undefined ||
    runtimeState.activeSessionId === undefined
  ) {
    return DEFAULT_REFRESH_INTERVAL_MS
  }

  const config = await loadConfig(runtimeState.activeContext)
  const currentState = stateForSession(
    sessionStates,
    runtimeState.activeContext,
    runtimeState.activeSessionId,
  )
  const settledState = settleDeveloperCostState(currentState, Date.now(), config)

  sessionStates.set(runtimeState.activeSessionId, settledState)
  runtimeState.activeConfig = config
  updateStatus(runtimeState.activeContext, settledState, config)

  return refreshIntervalMs(config)
}

function clearActiveStatus(runtimeState: RuntimeState, ctx: ExtensionContext): void {
  ctx.ui.setStatus(STATUS_KEY, undefined)
  runtimeState.activeContext = undefined
  runtimeState.activeSessionId = undefined
  runtimeState.activeConfig = undefined
}

async function loadConfig(ctx: ExtensionContext): Promise<DeveloperCostConfig> {
  const [runtimeConfig, projectOverrides] = await Promise.all([
    readJsonFile<PluginRuntimeConfig>(pluginsLockfilePath()),
    readJsonFile<ProjectPluginOverrides>(projectPluginOverridesPath(ctx.cwd)),
  ])
  const globalSettings = runtimeConfig?.settings?.[PLUGIN_NAME] ?? {}
  const projectSettings = projectOverrides?.settings?.[PLUGIN_NAME] ?? {}
  const mergedSettings = {
    ...globalSettings,
    ...projectSettings,
  }

  return parseDeveloperCostConfig(mergedSettings as DeveloperCostOptions)
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
  ctx.ui.setStatus(STATUS_KEY, ctx.ui.theme.fg("dim", statusText(state, Date.now(), config)))
}

function statusText(state: DeveloperCostState, nowMs: number, config: DeveloperCostConfig): string {
  const text = formatDeveloperCost(displayedDeveloperCost(state, nowMs, config))

  return `${text} (${config.label})`
}

async function readJsonFile<T>(filePath: string): Promise<T | undefined> {
  try {
    const raw = await fs.promises.readFile(filePath, "utf8")

    return JSON.parse(raw) as T
  } catch (error) {
    if (isEnoent(error)) return undefined

    return undefined
  }
}

function isEnoent(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT"
}

function pluginsLockfilePath(): string {
  return path.join(homedir(), ".omp", "plugins", "omp-plugins.lock.json")
}

function projectPluginOverridesPath(cwd: string): string {
  return path.join(cwd, ".omp", "plugin-overrides.json")
}
