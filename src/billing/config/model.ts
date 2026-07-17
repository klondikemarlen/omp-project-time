import type { BillableTimeConfig } from "@/billable-time/config.js"

export type DeveloperCostConfig = {
  annualGrossSalary: number
  workingHoursPerWeek: number
  workingWeeksPerYear: number
  activeWindowMinutes: number
  refreshIntervalSeconds: number
  label: string
  locale: string
  billableTime: BillableTimeConfig
}

export type DeveloperCostOptions = {
  annualGrossSalary?: unknown
  workingHoursPerWeek?: unknown
  workingWeeksPerYear?: unknown
  activeWindowMinutes?: unknown
  refreshIntervalSeconds?: unknown
  label?: unknown
  locale?: unknown
  repositoryBilling?: unknown
  monthlySalary?: unknown
  hoursPerWeek?: unknown
  weeksPerYear?: unknown
  billablePolicies?: unknown
  billableTime?: unknown
}
