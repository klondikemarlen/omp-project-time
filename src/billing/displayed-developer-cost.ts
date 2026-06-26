import Big from "big.js"

import type { DeveloperCostState } from "./developer-cost-state.js"

export function displayedDeveloperCost(state: DeveloperCostState): Big {
  return Big(state.totalCost)
}
