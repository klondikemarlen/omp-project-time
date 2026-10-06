import { summarizeTimeLogEntries } from "@/time-log/domain/statistics.js";
import { parseTimeLogEntry } from "@/time-log/domain/parse-entry.js";
import type { TimeLogEntry } from "@/time-log/domain/model.js";

export const TIME_LOG_EVIDENCE_FORMAT = "omp-project-time/evidence"
export const TIME_LOG_EVIDENCE_VERSION = 1

export const TIME_LOG_STATISTICS_FORMAT = "omp-project-time/statistics"
export const TIME_LOG_PRUNE_FORMAT = "omp-project-time/prune"

export type TimeLogState = {
  format: typeof TIME_LOG_EVIDENCE_FORMAT
  version: typeof TIME_LOG_EVIDENCE_VERSION
  entries: TimeLogEntry[]
}

export function formatTimeLogEvidence(
  entries: readonly TimeLogEntry[],
  project: string | undefined,
): string {
  return JSON.stringify(
    {
      format: TIME_LOG_EVIDENCE_FORMAT,
      version: TIME_LOG_EVIDENCE_VERSION,
      entries: selectedEntries(entries, project),
    },
    null,
    2,
  )
}

export function formatTimeLogStatistics(
  entries: readonly TimeLogEntry[],
  project: string | undefined,
): string {
  return JSON.stringify(
    {
      format: TIME_LOG_STATISTICS_FORMAT,
      version: TIME_LOG_EVIDENCE_VERSION,
      ...summarizeTimeLogEntries(selectedEntries(entries, project)),
    },
    null,
    2,
  )
}

export function formatTimeLogPruneResult({
  before,
  deletedEntryCount,
  dryRun,
  matchingEntryCount,
  retainedEntryCount,
}: {
  before: string
  deletedEntryCount: number
  dryRun: boolean
  matchingEntryCount: number
  retainedEntryCount: number
}): string {
  return JSON.stringify(
    {
      format: TIME_LOG_PRUNE_FORMAT,
      version: TIME_LOG_EVIDENCE_VERSION,
      before,
      dryRun,
      matchingEntryCount,
      deletedEntryCount,
      retainedEntryCount,
    },
    null,
    2,
  )
}

function selectedEntries(
  entries: readonly TimeLogEntry[],
  project: string | undefined,
): readonly TimeLogEntry[] {
  return project === undefined
    ? entries
    : entries.filter((entry) => entry.project === project)
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
