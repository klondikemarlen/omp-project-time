import { isFiniteNumber } from "@/utils/is-finite-number.js"

export function parseOptionalNumber(value: unknown): number | undefined {
  if (!isFiniteNumber(value)) return undefined

  return value
}

export default parseOptionalNumber
