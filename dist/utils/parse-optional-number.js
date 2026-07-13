import { isFiniteNumber } from "./is-finite-number.js";

export function parseOptionalNumber(value) {
  if (!isFiniteNumber(value)) return undefined;
  return value;
}
