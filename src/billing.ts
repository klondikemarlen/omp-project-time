import Big from "big.js"

export type DeveloperCostConfig = {
  monthlySalary: number
  hoursPerWeek: number
  weeksPerYear: number
  activeWindowMinutes: number
  refreshIntervalSeconds: number
  label: string
}

export type DeveloperCostState = {
  totalCost: string
  activeStartAtMs?: number
  activeUntilMs?: number
  lastSettledAtMs?: number
  lastPromptAtMs?: number
}

export type DeveloperCostOptions = {
  monthlySalary?: unknown
  hoursPerWeek?: unknown
  weeksPerYear?: unknown
  activeWindowMinutes?: unknown
  refreshIntervalSeconds?: unknown
  label?: unknown
}

const DEFAULT_MONTHLY_SALARY = 6_500
const DEFAULT_HOURS_PER_WEEK = 40
const DEFAULT_WEEKS_PER_YEAR = 52
const DEFAULT_ACTIVE_WINDOW_MINUTES = 5
const DEFAULT_REFRESH_INTERVAL_SECONDS = 15
const DEFAULT_LABEL = "dev"
const MONTHS_PER_YEAR = 12
const MINUTES_PER_HOUR = 60
const SECONDS_PER_MINUTE = 60
const MS_PER_SECOND = 1000
const MS_PER_MINUTE = SECONDS_PER_MINUTE * MS_PER_SECOND
const MS_PER_HOUR = MINUTES_PER_HOUR * MS_PER_MINUTE

export function parseDeveloperCostConfig(options?: DeveloperCostOptions): DeveloperCostConfig {
  const monthlySalary = parsePositiveNumber(options?.monthlySalary) ?? DEFAULT_MONTHLY_SALARY
  const hoursPerWeek = parsePositiveNumber(options?.hoursPerWeek) ?? DEFAULT_HOURS_PER_WEEK
  const weeksPerYear = parsePositiveNumber(options?.weeksPerYear) ?? DEFAULT_WEEKS_PER_YEAR
  const activeWindowMinutes =
    parsePositiveNumber(options?.activeWindowMinutes) ?? DEFAULT_ACTIVE_WINDOW_MINUTES
  const refreshIntervalSeconds =
    parsePositiveNumber(options?.refreshIntervalSeconds) ?? DEFAULT_REFRESH_INTERVAL_SECONDS
  const label = parseNonEmptyString(options?.label)?.toLowerCase() ?? DEFAULT_LABEL

  return {
    monthlySalary,
    hoursPerWeek,
    weeksPerYear,
    activeWindowMinutes,
    refreshIntervalSeconds,
    label,
  }
}

export function emptyDeveloperCostState(): DeveloperCostState {
  return {
    totalCost: "0",
  }
}

export function parseDeveloperCostState(value: unknown): DeveloperCostState | undefined {
  if (typeof value !== "object" || value === null) return undefined

  const candidate = value as Record<string, unknown>
  const totalCost = parseDecimalString(candidate.totalCost)
  if (totalCost === undefined) return undefined

  const activeStartAtMs = parseOptionalNumber(candidate.activeStartAtMs)
  const activeUntilMs = parseOptionalNumber(candidate.activeUntilMs)
  const lastSettledAtMs = parseOptionalNumber(candidate.lastSettledAtMs)
  const lastPromptAtMs = parseOptionalNumber(candidate.lastPromptAtMs)

  return {
    totalCost,
    activeStartAtMs,
    activeUntilMs,
    lastSettledAtMs,
    lastPromptAtMs,
  }
}

export function windowRate(config: DeveloperCostConfig): Big {
  return costForActiveMs(config, activeWindowMs(config))
}

export function refreshIntervalMs(config: DeveloperCostConfig): number {
  return (config.refreshIntervalSeconds * MS_PER_MINUTE) / MINUTES_PER_HOUR
}

export function displayedDeveloperCost(state: DeveloperCostState): Big {
  return Big(state.totalCost)
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

  const settleFromMs = nextState.lastSettledAtMs ?? nextState.activeStartAtMs
  const settleUntilMs = Math.min(nowMs, nextState.activeUntilMs)
  const elapsedMs = Math.max(0, settleUntilMs - settleFromMs)

  if (elapsedMs > 0) {
    nextState.totalCost = Big(nextState.totalCost).plus(costForActiveMs(config, elapsedMs)).toString()
    nextState.lastSettledAtMs = settleUntilMs
  }

  if (nowMs < nextState.activeUntilMs) {
    return nextState
  }

  delete nextState.activeStartAtMs
  delete nextState.activeUntilMs
  delete nextState.lastSettledAtMs

  return nextState
}

export function recordDeveloperPrompt(
  state: DeveloperCostState,
  promptAtMs: number,
  config: DeveloperCostConfig,
): DeveloperCostState {
  const nextState = settleDeveloperCostState(state, promptAtMs, config)
  const windowMs = activeWindowMs(config)

  if (nextState.activeStartAtMs === undefined || nextState.activeUntilMs === undefined) {
    nextState.activeStartAtMs = promptAtMs
    nextState.lastSettledAtMs = promptAtMs
    nextState.activeUntilMs = promptAtMs + windowMs
  } else {
    nextState.activeUntilMs = Math.max(nextState.activeUntilMs, promptAtMs + windowMs)
  }

  nextState.lastPromptAtMs = promptAtMs

  return nextState
}

export function formatDeveloperCost(value: Big): string {
  return `$${value.toFixed(2)}`
}

function costForActiveMs(config: DeveloperCostConfig, activeMs: number): Big {
  const annualSalary = Big(config.monthlySalary).times(MONTHS_PER_YEAR)
  const annualMs = Big(config.hoursPerWeek).times(config.weeksPerYear).times(MS_PER_HOUR)

  return annualSalary.times(activeMs).div(annualMs)
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

function parseDecimalString(value: unknown): string | undefined {
  if (isFiniteNumber(value)) return Big(value).toString()
  if (typeof value !== "string") return undefined

  try {
    return Big(value).toString()
  } catch {
    return undefined
  }
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value)
}

function activeWindowMs(config: DeveloperCostConfig): number {
  return config.activeWindowMinutes * MS_PER_MINUTE
}
