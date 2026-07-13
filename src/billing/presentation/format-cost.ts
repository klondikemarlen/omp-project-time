import type Big from "@/vendor/big.js"

export function formatDeveloperCost(value: Big): string {
  return `$${value.toFixed(2)}`
}

export default formatDeveloperCost
