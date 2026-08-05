import { parseTimeLogEntry } from "@/time-log/domain/parse-entry.js";
import type { TimeLogEntry } from "@/time-log/domain/model.js";

export const TIME_LOG_EVIDENCE_FORMAT = "omp-project-time/evidence"
export const TIME_LOG_EVIDENCE_VERSION = 1

export type TimeLogState = {
  format: typeof TIME_LOG_EVIDENCE_FORMAT
  version: typeof TIME_LOG_EVIDENCE_VERSION
  entries: TimeLogEntry[]
}

export function parseTimeLogState(value: unknown): TimeLogState | undefined {
  if (
    typeof value !== "object" ||
    value === null ||
    !("entries" in value) ||
    !Array.isArray(value.entries)
  ) {
    return undefined;
  }
  const candidate = value as Record<string, unknown>
  if (
    (candidate.format !== undefined || candidate.version !== undefined) &&
    (candidate.format !== TIME_LOG_EVIDENCE_FORMAT ||
      candidate.version !== TIME_LOG_EVIDENCE_VERSION)
  ) {
    return undefined
  }

  const entries: TimeLogEntry[] = [];
  for (const valueEntry of value.entries) {
    const entry = parseTimeLogEntry(valueEntry);
    if (entry === undefined) {
      if (isObsoleteManualEntry(valueEntry)) continue;
      return undefined;
    }
    entries.push(entry);
  }

  return {
    format: TIME_LOG_EVIDENCE_FORMAT,
    version: TIME_LOG_EVIDENCE_VERSION,
    entries,
  }
}

function isObsoleteManualEntry(value: unknown): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    "sourceKind" in value &&
    value.sourceKind === "manual_tracked"
  );
}
