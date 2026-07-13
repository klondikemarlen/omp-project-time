import type { DeveloperCostState } from "@/billing/state/model.js"

export function emptyDeveloperCostState(): DeveloperCostState {
  return {
    totalCost: "0",
    promptCount: 0,
    activeMilliseconds: 0,
  }
}

export default emptyDeveloperCostState
