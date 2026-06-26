import Big from "big.js"

import { activeWindowMs } from "./active-window-ms.js"
import { costForActiveMs } from "./cost-for-active-ms.js"
import type { DeveloperCostConfig } from "./developer-cost-config.js"

export function windowRate(config: DeveloperCostConfig): Big {
  return costForActiveMs(config, activeWindowMs(config))
}
