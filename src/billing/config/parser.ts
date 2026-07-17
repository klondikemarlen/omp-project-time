import { parseBillableTimeConfig } from "@/billable-time/config.js"
import { MONTHS_PER_YEAR } from "@/billing/calculation/time-constants.js"

import {
  DEFAULT_ACTIVE_WINDOW_MINUTES,
  DEFAULT_ANNUAL_GROSS_SALARY,
  DEFAULT_LABEL,
  DEFAULT_LOCALE,
  DEFAULT_REFRESH_INTERVAL_SECONDS,
  DEFAULT_WORKING_HOURS_PER_WEEK,
  DEFAULT_WORKING_WEEKS_PER_YEAR,
} from "@/billing/config/defaults.js"
import type { DeveloperCostConfig, DeveloperCostOptions } from "@/billing/config/model.js"
import { parseNonEmptyString } from "@/utils/parse-non-empty-string.js"
import { parsePositiveNumber } from "@/utils/parse-positive-number.js"

export function parseDeveloperCostConfig(options?: DeveloperCostOptions): DeveloperCostConfig {
  const legacyMonthlySalary = parsePositiveNumber(options?.monthlySalary)
  const rawAnnualGrossSalary = options?.annualGrossSalary
    ?? (legacyMonthlySalary === undefined
      ? DEFAULT_ANNUAL_GROSS_SALARY
      : legacyMonthlySalary * MONTHS_PER_YEAR)
  const rawWorkingHoursPerWeek = options?.workingHoursPerWeek
    ?? options?.hoursPerWeek
    ?? DEFAULT_WORKING_HOURS_PER_WEEK
  const rawWorkingWeeksPerYear = options?.workingWeeksPerYear
    ?? options?.weeksPerYear
    ?? DEFAULT_WORKING_WEEKS_PER_YEAR
  const rawActiveWindowMinutes = options?.activeWindowMinutes ?? DEFAULT_ACTIVE_WINDOW_MINUTES
  const rawRefreshIntervalSeconds =
    options?.refreshIntervalSeconds ?? DEFAULT_REFRESH_INTERVAL_SECONDS
  const rawLabel = options?.label ?? DEFAULT_LABEL
  const rawLocale = options?.locale ?? DEFAULT_LOCALE
  const rawRepositoryBilling = options?.repositoryBilling ?? options?.billablePolicies ?? options?.billableTime
  const annualGrossSalary = parsePositiveNumber(rawAnnualGrossSalary) ?? DEFAULT_ANNUAL_GROSS_SALARY
  const workingHoursPerWeek =
    parsePositiveNumber(rawWorkingHoursPerWeek) ?? DEFAULT_WORKING_HOURS_PER_WEEK
  const workingWeeksPerYear =
    parsePositiveNumber(rawWorkingWeeksPerYear) ?? DEFAULT_WORKING_WEEKS_PER_YEAR
  const activeWindowMinutes =
    parsePositiveNumber(rawActiveWindowMinutes) ?? DEFAULT_ACTIVE_WINDOW_MINUTES
  const refreshIntervalSeconds =
    parsePositiveNumber(rawRefreshIntervalSeconds) ?? DEFAULT_REFRESH_INTERVAL_SECONDS
  const label = parseNonEmptyString(rawLabel)?.toLowerCase() ?? DEFAULT_LABEL
  const locale = parseNumberFormatLocale(rawLocale)
  const billableTime = parseBillableTimeConfig(rawRepositoryBilling)

  return {
    annualGrossSalary,
    workingHoursPerWeek,
    workingWeeksPerYear,
    activeWindowMinutes,
    refreshIntervalSeconds,
    label,
    locale,
    billableTime,
  }
}

export function parseStoredDeveloperCostConfig(value: unknown): DeveloperCostConfig | undefined {
  if (typeof value !== "object" || value === null) return undefined

  const candidate = value as Record<string, unknown>
  const {
    repositoryBilling: _repositoryBilling,
    billablePolicies: _billablePolicies,
    billableTime: _billableTime,
    ...scalarOptions
  } = candidate
  let config: DeveloperCostConfig
  try {
    config = parseDeveloperCostConfig(scalarOptions)
  } catch {
    return undefined
  }
  const legacyMonthlySalary = parsePositiveNumber(candidate.monthlySalary)
  const annualGrossSalary = candidate.annualGrossSalary
    ?? (legacyMonthlySalary === undefined ? undefined : legacyMonthlySalary * MONTHS_PER_YEAR)
  const workingHoursPerWeek = candidate.workingHoursPerWeek ?? candidate.hoursPerWeek
  const workingWeeksPerYear = candidate.workingWeeksPerYear ?? candidate.weeksPerYear

  if (
    annualGrossSalary !== config.annualGrossSalary
    || workingHoursPerWeek !== config.workingHoursPerWeek
    || workingWeeksPerYear !== config.workingWeeksPerYear
    || candidate.activeWindowMinutes !== config.activeWindowMinutes
    || candidate.refreshIntervalSeconds !== config.refreshIntervalSeconds
  ) {
    return undefined
  }

  const label = parseNonEmptyString(candidate.label)?.toLowerCase()
  return (
    label === config.label
    && (candidate.locale === undefined || candidate.locale === config.locale)
  )
    ? config
    : undefined
}

function parseNumberFormatLocale(value: unknown): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error("Project Time locale must be a BCP 47 locale supported by Intl.NumberFormat.")
  }

  try {
    const [locale] = Intl.NumberFormat.supportedLocalesOf([value.trim()])
    if (locale !== undefined) return locale
  } catch {}

  throw new Error("Project Time locale must be a BCP 47 locale supported by Intl.NumberFormat.")
}

export default parseDeveloperCostConfig
