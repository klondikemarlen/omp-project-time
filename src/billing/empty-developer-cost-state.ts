import type { DeveloperCostState } from "./developer-cost-state.js"

export function emptyDeveloperCostState(): DeveloperCostState {
  return {
    totalCost: "0",
  }
}
