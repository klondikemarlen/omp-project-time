import type { DeveloperCostOptions } from "@/billing/index.js"
import { MONTHS_PER_YEAR } from "@/billing/calculation/time-constants.js"
import { PLUGIN_NAME } from "@/config/plugin-name.js"
import type { PluginConfig } from "@/config/parse-plugin-config.js"
import { settingsForPlugin } from "@/config/settings-for-plugin.js"
import { parsePositiveNumber } from "@/utils/parse-positive-number.js"

export function resolveDeveloperCostOptions(
  globalConfig: PluginConfig | undefined,
  projectConfig: PluginConfig | undefined,
): DeveloperCostOptions {
  return {
    ...normalizeLegacySettings(settingsForPlugin(globalConfig, PLUGIN_NAME)),
    ...normalizeLegacySettings(settingsForPlugin(projectConfig, PLUGIN_NAME)),
  }
}

function normalizeLegacySettings(settings: Record<string, unknown>): DeveloperCostOptions {
  const monthlySalary = parsePositiveNumber(settings.monthlySalary)
  const annualGrossSalary = settings.annualGrossSalary
    ?? (monthlySalary === undefined ? undefined : monthlySalary * MONTHS_PER_YEAR)
  const workingHoursPerWeek = settings.workingHoursPerWeek ?? settings.hoursPerWeek
  const workingWeeksPerYear = settings.workingWeeksPerYear ?? settings.weeksPerYear

  return {
    ...settings,
    ...(annualGrossSalary === undefined ? {} : { annualGrossSalary }),
    ...(workingHoursPerWeek === undefined ? {} : { workingHoursPerWeek }),
    ...(workingWeeksPerYear === undefined ? {} : { workingWeeksPerYear }),
  }
}
