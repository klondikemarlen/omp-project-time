import type { BillableTimeConfig } from "@/billable-time/config.js"

export type DeveloperCostConfig = {
  monthlySalary: number
  hoursPerWeek: number
  weeksPerYear: number
  activeWindowMinutes: number
  refreshIntervalSeconds: number
  label: string
  billableTime: BillableTimeConfig
}

export type DeveloperCostOptions = {
  monthlySalary?: unknown
  hoursPerWeek?: unknown
  weeksPerYear?: unknown
  activeWindowMinutes?: unknown
  refreshIntervalSeconds?: unknown
  label?: unknown
  billableTime?: unknown
}
