import Big from "big.js";
import { isFiniteNumber } from "./is-finite-number.js";

export function parseDecimalString(value) {
  if (isFiniteNumber(value)) return Big(value).toString();
  if (typeof value !== "string") return undefined;
  try {
    return Big(value).toString();
  } catch {
    return undefined;
  }
}
