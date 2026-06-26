import Big from "big.js"

import type { DeveloperCostConfig } from "./developer-cost-config.js"
import { MONTHS_PER_YEAR, MS_PER_HOUR } from "./time-constants.js"

export function costForActiveMs(config: DeveloperCostConfig, activeMs: number): Big {
  const annualSalary = Big(config.monthlySalary).times(MONTHS_PER_YEAR)
  const annualMs = Big(config.hoursPerWeek).times(config.weeksPerYear).times(MS_PER_HOUR)

  return annualSalary.times(activeMs).div(annualMs)
}
