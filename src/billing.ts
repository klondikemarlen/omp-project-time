export type DeveloperCostConfig = {
  annualSalaryUsd: number
  hoursPerWeek: number
  weeksPerYear: number
  activeWindowMinutes: number
  currencyCode: string
  label: string
}

export type DeveloperCostState = {
  totalUsd: number
  activeStartAtMs?: number
  activeUntilMs?: number
  billedWindows: number
  lastPromptAtMs?: number
}

export type DeveloperCostOptions = {
  annualSalaryUsd?: unknown
  hoursPerWeek?: unknown
  weeksPerYear?: unknown
  activeWindowMinutes?: unknown
  currencyCode?: unknown
  label?: unknown
}

export type ParsedDeveloperCostConfig =
  | { ok: true; config: DeveloperCostConfig }
  | { ok: false; error: string }

const DEFAULT_ACTIVE_WINDOW_MINUTES = 5
const DEFAULT_CURRENCY_CODE = "USD"
const DEFAULT_LABEL = "Dev"

export function parseDeveloperCostConfig(options: DeveloperCostOptions | undefined): ParsedDeveloperCostConfig {
  const annualSalaryUsd = parsePositiveNumber(options?.annualSalaryUsd)
  if (annualSalaryUsd === undefined) {
    return { ok: false, error: "annualSalaryUsd must be a positive number" }
  }

  const hoursPerWeek = parsePositiveNumber(options?.hoursPerWeek)
  if (hoursPerWeek === undefined) {
    return { ok: false, error: "hoursPerWeek must be a positive number" }
  }

  const weeksPerYear = parsePositiveNumber(options?.weeksPerYear)
  if (weeksPerYear === undefined) {
    return { ok: false, error: "weeksPerYear must be a positive number" }
  }

  const activeWindowMinutes =
    parsePositiveNumber(options?.activeWindowMinutes) ?? DEFAULT_ACTIVE_WINDOW_MINUTES
  const currencyCode = parseNonEmptyString(options?.currencyCode) ?? DEFAULT_CURRENCY_CODE
  const label = parseNonEmptyString(options?.label) ?? DEFAULT_LABEL

  return {
    ok: true,
    config: {
      annualSalaryUsd,
      hoursPerWeek,
      weeksPerYear,
      activeWindowMinutes,
      currencyCode,
      label,
    },
  }
}

export function emptyDeveloperCostState(): DeveloperCostState {
  return {
    totalUsd: 0,
    billedWindows: 0,
  }
}

export function isDeveloperCostState(value: unknown): value is DeveloperCostState {
  if (typeof value !== "object" || value === null) return false

  const candidate = value as Record<string, unknown>
  if (typeof candidate.totalUsd !== "number" || !Number.isFinite(candidate.totalUsd)) return false
  if (typeof candidate.billedWindows !== "number" || !Number.isFinite(candidate.billedWindows)) return false

  return true
}

export function windowRateUsd(config: DeveloperCostConfig): number {
  const annualMinutes = config.hoursPerWeek * config.weeksPerYear * 60

  return (config.annualSalaryUsd / annualMinutes) * config.activeWindowMinutes
}

export function settleDeveloperCostState(
  state: DeveloperCostState,
  nowMs: number,
  config: DeveloperCostConfig,
): DeveloperCostState {
  const next = { ...state }

  if (next.activeStartAtMs === undefined || next.activeUntilMs === undefined) {
    return next
  }

  const effectiveEndMs = Math.min(nowMs, next.activeUntilMs)
  const elapsedMs = Math.max(0, effectiveEndMs - next.activeStartAtMs)
  const windowCount = Math.floor(elapsedMs / activeWindowMs(config))
  const newWindows = Math.max(0, windowCount - next.billedWindows)

  if (newWindows > 0) {
    next.totalUsd += newWindows * windowRateUsd(config)
    next.billedWindows += newWindows
  }

  if (nowMs >= next.activeUntilMs) {
    delete next.activeStartAtMs
    delete next.activeUntilMs
    next.billedWindows = 0
  }

  return next
}

export function recordDeveloperPrompt(
  state: DeveloperCostState,
  promptAtMs: number,
  config: DeveloperCostConfig,
): DeveloperCostState {
  const next = settleDeveloperCostState(state, promptAtMs, config)
  const windowMs = activeWindowMs(config)

  if (next.activeStartAtMs === undefined || next.activeUntilMs === undefined || promptAtMs > next.activeUntilMs) {
    next.activeStartAtMs = promptAtMs
    next.activeUntilMs = promptAtMs + windowMs
    next.billedWindows = 0
  } else {
    next.activeUntilMs = Math.max(next.activeUntilMs, promptAtMs + windowMs)
  }

  next.lastPromptAtMs = promptAtMs

  return next
}

export function isActive(state: DeveloperCostState, nowMs: number): boolean {
  return state.activeUntilMs !== undefined && nowMs < state.activeUntilMs
}

export function formatDeveloperCost(valueUsd: number, currencyCode: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currencyCode,
    maximumFractionDigits: 2,
  }).format(valueUsd)
}

function parsePositiveNumber(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return undefined

  return value
}

function parseNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined

  const trimmed = value.trim()
  if (!trimmed) return undefined

  return trimmed
}

function activeWindowMs(config: DeveloperCostConfig): number {
  return config.activeWindowMinutes * 60 * 1000
}
