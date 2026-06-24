export type DeveloperCostConfig = {
  monthlySalary: number
  hoursPerWeek: number
  activeWindowMinutes: number
  refreshIntervalSeconds: number
  label: string
}

export type DeveloperCostState = {
  totalCost: number
  activeStartAtMs?: number
  activeUntilMs?: number
  billedWindows: number
  lastPromptAtMs?: number
}

export type DeveloperCostOptions = {
  monthlySalary?: unknown
  hoursPerWeek?: unknown
  activeWindowMinutes?: unknown
  refreshIntervalSeconds?: unknown
  label?: unknown
}

const DEFAULT_MONTHLY_SALARY = 6_500
const DEFAULT_HOURS_PER_WEEK = 40
const DEFAULT_ACTIVE_WINDOW_MINUTES = 5
const DEFAULT_REFRESH_INTERVAL_SECONDS = 5
const DEFAULT_LABEL = "dev"
const MONTHS_PER_YEAR = 12
const WEEKS_PER_YEAR = 52
const MINUTES_PER_HOUR = 60
const MS_PER_MINUTE = 60 * 1000

export function parseDeveloperCostConfig(options?: DeveloperCostOptions): DeveloperCostConfig {
  return {
    monthlySalary: parsePositiveNumber(options?.monthlySalary) ?? DEFAULT_MONTHLY_SALARY,
    hoursPerWeek: parsePositiveNumber(options?.hoursPerWeek) ?? DEFAULT_HOURS_PER_WEEK,
    activeWindowMinutes:
      parsePositiveNumber(options?.activeWindowMinutes) ?? DEFAULT_ACTIVE_WINDOW_MINUTES,
    refreshIntervalSeconds:
      parsePositiveNumber(options?.refreshIntervalSeconds) ?? DEFAULT_REFRESH_INTERVAL_SECONDS,
    label: parseNonEmptyString(options?.label)?.toLowerCase() ?? DEFAULT_LABEL,
  }
}

export function emptyDeveloperCostState(): DeveloperCostState {
  return {
    totalCost: 0,
    billedWindows: 0,
  }
}

export function parseDeveloperCostState(value: unknown): DeveloperCostState | undefined {
  if (typeof value !== "object" || value === null) return undefined

  const candidate = value as Record<string, unknown>
  if (!isFiniteNumber(candidate.totalCost)) return undefined
  if (!isFiniteNumber(candidate.billedWindows)) return undefined

  return {
    totalCost: candidate.totalCost,
    activeStartAtMs: parseOptionalNumber(candidate.activeStartAtMs),
    activeUntilMs: parseOptionalNumber(candidate.activeUntilMs),
    billedWindows: candidate.billedWindows,
    lastPromptAtMs: parseOptionalNumber(candidate.lastPromptAtMs),
  }
}

export function windowRate(config: DeveloperCostConfig): number {
  const monthlyMinutes = (config.hoursPerWeek * WEEKS_PER_YEAR * MINUTES_PER_HOUR) / MONTHS_PER_YEAR

  return (config.monthlySalary / monthlyMinutes) * config.activeWindowMinutes
}

export function refreshIntervalMs(config: DeveloperCostConfig): number {
  return config.refreshIntervalSeconds * MS_PER_MINUTE / MINUTES_PER_HOUR
}

export function displayedDeveloperCost(
  state: DeveloperCostState,
  nowMs: number,
  config: DeveloperCostConfig,
): number {
  if (state.activeStartAtMs === undefined || state.activeUntilMs === undefined) {
    return state.totalCost
  }

  const elapsedMs = Math.max(0, Math.min(nowMs, state.activeUntilMs) - state.activeStartAtMs)
  const activeWindowCount = elapsedMs / activeWindowMs(config)
  const unpaidWindowCount = Math.max(0, activeWindowCount - state.billedWindows)

  return state.totalCost + unpaidWindowCount * windowRate(config)
}

export function settleDeveloperCostState(
  state: DeveloperCostState,
  nowMs: number,
  config: DeveloperCostConfig,
): DeveloperCostState {
  const nextState = { ...state }

  if (nextState.activeStartAtMs === undefined || nextState.activeUntilMs === undefined) {
    return nextState
  }

  const elapsedMs = Math.max(0, Math.min(nowMs, nextState.activeUntilMs) - nextState.activeStartAtMs)
  const settledWindowCount = Math.floor(elapsedMs / activeWindowMs(config))
  const newWindowCount = Math.max(0, settledWindowCount - nextState.billedWindows)

  if (newWindowCount > 0) {
    nextState.totalCost += newWindowCount * windowRate(config)
    nextState.billedWindows += newWindowCount
  }

  if (nowMs < nextState.activeUntilMs) {
    return nextState
  }

  delete nextState.activeStartAtMs
  delete nextState.activeUntilMs
  nextState.billedWindows = 0

  return nextState
}

export function recordDeveloperPrompt(
  state: DeveloperCostState,
  promptAtMs: number,
  config: DeveloperCostConfig,
): DeveloperCostState {
  const nextState = settleDeveloperCostState(state, promptAtMs, config)
  const windowMs = activeWindowMs(config)

  if (
    nextState.activeStartAtMs === undefined ||
    nextState.activeUntilMs === undefined ||
    promptAtMs > nextState.activeUntilMs
  ) {
    nextState.activeStartAtMs = promptAtMs
    nextState.activeUntilMs = promptAtMs + windowMs
    nextState.billedWindows = 0
  } else {
    nextState.activeUntilMs = Math.max(nextState.activeUntilMs, promptAtMs + windowMs)
  }

  nextState.lastPromptAtMs = promptAtMs

  return nextState
}

export function formatDeveloperCost(value: number): string {
  return `$${value.toFixed(2)}`
}

function parsePositiveNumber(value: unknown): number | undefined {
  if (!isFiniteNumber(value) || value <= 0) return undefined

  return value
}

function parseOptionalNumber(value: unknown): number | undefined {
  if (!isFiniteNumber(value)) return undefined

  return value
}

function parseNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined

  const trimmed = value.trim()
  if (!trimmed) return undefined

  return trimmed
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value)
}

function activeWindowMs(config: DeveloperCostConfig): number {
  return config.activeWindowMinutes * MS_PER_MINUTE
}
