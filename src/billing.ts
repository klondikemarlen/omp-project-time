export type DeveloperCostConfig = {
  annualSalary: number
  hoursPerWeek: number
  weeksPerYear: number
  activeWindowMinutes: number
  currencyCode: string
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
  annualSalary?: unknown
  annualSalaryUsd?: unknown
  hoursPerWeek?: unknown
  weeksPerYear?: unknown
  activeWindowMinutes?: unknown
  currencyCode?: unknown
  label?: unknown
}

type LegacyDeveloperCostState = {
  totalUsd: number
  activeStartAtMs?: number
  activeUntilMs?: number
  billedWindows: number
  lastPromptAtMs?: number
}

const DEFAULT_ANNUAL_SALARY = 80_000
const DEFAULT_HOURS_PER_WEEK = 40
const DEFAULT_WEEKS_PER_YEAR = 50
const DEFAULT_ACTIVE_WINDOW_MINUTES = 5
const DEFAULT_CURRENCY_CODE = "CAD"
const DEFAULT_LABEL = "dev"
const DEFAULT_LOCALE = "en-US"
const CANADIAN_LOCALE = "en-CA"
const MINUTES_PER_HOUR = 60
const MS_PER_MINUTE = 60 * 1000

export function parseDeveloperCostConfig(options?: DeveloperCostOptions): DeveloperCostConfig {
  return {
    annualSalary: parseAnnualSalary(options),
    hoursPerWeek: parsePositiveNumber(options?.hoursPerWeek) ?? DEFAULT_HOURS_PER_WEEK,
    weeksPerYear: parsePositiveNumber(options?.weeksPerYear) ?? DEFAULT_WEEKS_PER_YEAR,
    activeWindowMinutes:
      parsePositiveNumber(options?.activeWindowMinutes) ?? DEFAULT_ACTIVE_WINDOW_MINUTES,
    currencyCode: parseNonEmptyString(options?.currencyCode) ?? DEFAULT_CURRENCY_CODE,
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
  if (isFiniteNumber(candidate.totalCost) && isFiniteNumber(candidate.billedWindows)) {
    return {
      totalCost: candidate.totalCost,
      activeStartAtMs: parseOptionalNumber(candidate.activeStartAtMs),
      activeUntilMs: parseOptionalNumber(candidate.activeUntilMs),
      billedWindows: candidate.billedWindows,
      lastPromptAtMs: parseOptionalNumber(candidate.lastPromptAtMs),
    }
  }

  if (isLegacyDeveloperCostState(candidate)) {
    return {
      totalCost: candidate.totalUsd,
      activeStartAtMs: candidate.activeStartAtMs,
      activeUntilMs: candidate.activeUntilMs,
      billedWindows: candidate.billedWindows,
      lastPromptAtMs: candidate.lastPromptAtMs,
    }
  }

  return undefined
}

export function windowRate(config: DeveloperCostConfig): number {
  const annualMinutes = config.hoursPerWeek * config.weeksPerYear * MINUTES_PER_HOUR

  return (config.annualSalary / annualMinutes) * config.activeWindowMinutes
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

  const effectiveEndMs = Math.min(nowMs, nextState.activeUntilMs)
  const elapsedMs = Math.max(0, effectiveEndMs - nextState.activeStartAtMs)
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

export function formatDeveloperCost(value: number, currencyCode: string): string {
  return new Intl.NumberFormat(localeForCurrency(currencyCode), {
    style: "currency",
    currency: currencyCode,
    maximumFractionDigits: 2,
  }).format(value)
}

function parseAnnualSalary(options: DeveloperCostOptions | undefined): number {
  return (
    parsePositiveNumber(options?.annualSalary) ??
    parsePositiveNumber(options?.annualSalaryUsd) ??
    DEFAULT_ANNUAL_SALARY
  )
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

function isLegacyDeveloperCostState(value: Record<string, unknown>): value is LegacyDeveloperCostState {
  return isFiniteNumber(value.totalUsd) && isFiniteNumber(value.billedWindows)
}

function activeWindowMs(config: DeveloperCostConfig): number {
  return config.activeWindowMinutes * MS_PER_MINUTE
}

function localeForCurrency(currencyCode: string): string {
  if (currencyCode === "CAD") return CANADIAN_LOCALE

  return DEFAULT_LOCALE
}
