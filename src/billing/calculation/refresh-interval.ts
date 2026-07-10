import type { DeveloperCostConfig } from "../config/model.js"
import { MS_PER_SECOND } from "./time-constants.js"

export function refreshIntervalMs(config: DeveloperCostConfig): number {
  return config.refreshIntervalSeconds * MS_PER_SECOND
}
