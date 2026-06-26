import Big from "big.js"

export function formatDeveloperCost(value: Big): string {
  return `$${value.toFixed(2)}`
}
