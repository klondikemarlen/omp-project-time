import type { DeveloperCostConfig } from "../billing/index.js"

export type SessionHeaderLike = {
  parentSession?: unknown
}

export type SessionEntryLike = {
  type?: unknown
  customType?: unknown
  data?: unknown
}

export type SessionManagerLike = {
  getSessionId(): string
  getHeader(): SessionHeaderLike | null
  getEntries(): SessionEntryLike[]
}

export type ThemeLike = {
  fg(color: string, text: string): string
}

export type UiLike = {
  notify(message: string, type?: "info" | "warning" | "error"): void
  setStatus(key: string, text: string | undefined): void
  theme: ThemeLike
}

export type ExtensionContext = {
  cwd: string
  ui: UiLike
  sessionManager: SessionManagerLike
}

export type CommandHandler = (args: string, ctx: ExtensionContext) => Promise<void>

export type BeforeAgentStartHandler = (
  event: { prompt: string },
  ctx: ExtensionContext,
) => Promise<void>

export type SessionHandler = (
  event: { reason?: string },
  ctx: ExtensionContext,
) => Promise<void>

export type TurnEndHandler = (
  event: { type: "turn_end" },
  ctx: ExtensionContext,
) => Promise<void>


export type ExtensionApi = {
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

export type ConfigLoader = (cwd: string) => Promise<DeveloperCostConfig>

export type ExtensionOptions = {
  loadConfig?: ConfigLoader
  ledgerPath?: string
  timeLogPath?: string
}
