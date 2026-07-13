import Big from "big.js";

export function displayedDeveloperCost(state) {
  return Big(state.totalCost);
}
