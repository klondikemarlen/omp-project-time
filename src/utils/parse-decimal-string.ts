import Big from "@/vendor/big.js"

import { isFiniteNumber } from "@/utils/is-finite-number.js"

export function parseDecimalString(value: unknown): string | undefined {
  if (isFiniteNumber(value)) return Big(value).toString()
  if (typeof value !== "string") return undefined

  try {
    return Big(value).toString()
  } catch {
    return undefined
  }
}

export default parseDecimalString
