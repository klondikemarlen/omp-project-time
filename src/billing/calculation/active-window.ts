import type { DeveloperCostConfig } from "../config/model.js"
import { MS_PER_MINUTE } from "./time-constants.js"

export function activeWindowMs(config: DeveloperCostConfig): number {
  return config.activeWindowMinutes * MS_PER_MINUTE
}
