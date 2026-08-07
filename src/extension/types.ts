import type { Api, Model } from "@oh-my-pi/pi-ai"
import type { ActivityNarrative } from "@/time-log/domain/narrative.js"

import type { ProjectTimeConfig } from "@/config/project-time-config.js"

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
  getSessionName?: () => string
  getBranch?: () => SessionEntryLike[]
}

export type ThemeLike = {
  fg(color: string, text: string): string
}

export type UiLike = {
  notify(message: string, type?: "info" | "warning" | "error"): void
  setStatus(key: string, text: string | undefined): void
  theme: ThemeLike
}

type OmpModel = Model<Api>

type OmpModelRegistry = {
  getApiKey(model: OmpModel, sessionId: string): Promise<string | undefined>
}

export type ExtensionContext = {
  cwd: string
  ui: UiLike
  sessionManager: SessionManagerLike
  model?: OmpModel
  models?: {
    current(): OmpModel | undefined
    resolve(spec: string): OmpModel | undefined
  }
  modelRegistry?: OmpModelRegistry
}

export type CommandCompletion = {
  value: string
  label: string
  description?: string
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
  pi?: { settings?: Record<string, unknown> }
  registerCommand(
    name: string,
    options: {
      description?: string
      getArgumentCompletions?: (argumentPrefix: string) => CommandCompletion[] | null
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

export type ConfigLoader = (cwd: string) => Promise<ProjectTimeConfig>

export type GeneratedActivity = {
  activity?: string
  narrative?: ActivityNarrative
}

export type ActivityGenerationContext = {
  project: string
  repositoryIdentity?: string
}

export type ActivityGenerator = (
  prompt: string,
  ctx: ExtensionContext,
  activityContext: ActivityGenerationContext | undefined,
) => Promise<GeneratedActivity>
export type ExtensionOptions = {
  generateActivity?: ActivityGenerator
  activityGenerationTimeoutMs?: number
  loadConfig?: ConfigLoader
  prepareLocalData?: () => Promise<void>
  timeLogPath?: string
}
