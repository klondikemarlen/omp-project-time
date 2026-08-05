import { parseTimeLogEntry } from "@/time-log/domain/parse-entry.js"
import type { TimeLogEntry } from "@/time-log/domain/model.js"

export type TimeLogState = {
  entries: TimeLogEntry[]
}

export function parseTimeLogState(value: unknown): TimeLogState | undefined {
  if (
    typeof value !== "object" ||
    value === null ||
    !("entries" in value) ||
    !Array.isArray(value.entries)
  ) {
    return undefined
  }

  const entries: TimeLogEntry[] = []
  for (const valueEntry of value.entries) {
    const entry = parseTimeLogEntry(valueEntry)
    if (entry === undefined) {
      if (isObsoleteManualEntry(valueEntry)) continue
      return undefined
    }
    entries.push(entry)
  }

  return { entries }
}

function isObsoleteManualEntry(value: unknown): boolean {
  return typeof value === "object"
    && value !== null
    && "sourceKind" in value
    && value.sourceKind === "manual_tracked"
}
