import { isFiniteNumber } from "@/utils/is-finite-number.js"

export function parsePositiveNumber(value: unknown): number | undefined {
  if (!isFiniteNumber(value) || value <= 0) return undefined

  return value
}

export default parsePositiveNumber
