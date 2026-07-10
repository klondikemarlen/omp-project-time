import type { DeveloperCostState } from "./model.js"

export function emptyDeveloperCostState(): DeveloperCostState {
  return {
    totalCost: "0",
    promptCount: 0,
    activeMilliseconds: 0,
  }
}
