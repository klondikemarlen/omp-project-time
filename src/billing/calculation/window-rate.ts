import Big from "big.js"

import { activeWindowMs } from "./active-window.js"
import { costForActiveMs } from "./cost-for-active-time.js"
import type { DeveloperCostConfig } from "../config/model.js"

export function windowRate(config: DeveloperCostConfig): Big {
  return costForActiveMs(config, activeWindowMs(config))
}
