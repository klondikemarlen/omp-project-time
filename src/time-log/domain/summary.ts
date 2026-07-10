import type { TimeLogEntry } from "./model.js"

export type CompactedTimeLogRow = {
  allocationMilliseconds: number
  bucketStartAtMs: number
  date: string
  project: string
  repositoryId: string
}

export type TimeLogSummary = {
  allocationMilliseconds: number
  rows: CompactedTimeLogRow[]
  wallClockMilliseconds: number
}

export function exportTimeEntries(entries: readonly TimeLogEntry[]): string {
  return JSON.stringify({
    entries,
    summaries: {
      5: summarizeTimeEntries(entries, 5),
      10: summarizeTimeEntries(entries, 10),
      15: summarizeTimeEntries(entries, 15),
    },
  })
}

export function summarizeTimeEntries(
  entries: readonly TimeLogEntry[],
  compactionMinutes: number,
): TimeLogSummary {
  const bucketMilliseconds = compactionMilliseconds(compactionMinutes)
  const allocationMilliseconds = entries.reduce(
    (total, entry) => total + entry.endAtMs - entry.startAtMs,
    0,
  )
  const wallClockMilliseconds = unionMilliseconds(entries)
  const rowsByKey = new Map<string, CompactedTimeLogRow>()

  for (const entry of entries) {
    let segmentStartAtMs = entry.startAtMs
    while (segmentStartAtMs < entry.endAtMs) {
      const bucketStartAtMs = Math.floor(segmentStartAtMs / bucketMilliseconds) * bucketMilliseconds
      const segmentEndAtMs = Math.min(entry.endAtMs, bucketStartAtMs + bucketMilliseconds)
      const segmentAllocationMilliseconds = segmentEndAtMs - segmentStartAtMs
      const date = new Date(bucketStartAtMs).toISOString().slice(0, 10)
      const key = `${bucketStartAtMs}:${entry.repositoryId}`
      const existingRow = rowsByKey.get(key)

      if (existingRow === undefined) {
        rowsByKey.set(key, {
          bucketStartAtMs,
          date,
          project: entry.project,
          repositoryId: entry.repositoryId,
          allocationMilliseconds: segmentAllocationMilliseconds,
        })
      } else {
        existingRow.allocationMilliseconds += segmentAllocationMilliseconds
      }

      segmentStartAtMs = segmentEndAtMs
    }
  }

  const rows = [...rowsByKey.values()].sort(compareRows)
  return { allocationMilliseconds, wallClockMilliseconds, rows }
}

function compactionMilliseconds(compactionMinutes: number): number {
  if (compactionMinutes !== 5 && compactionMinutes !== 10 && compactionMinutes !== 15) {
    throw new Error("Time log compaction must be 5, 10, or 15 minutes.")
  }

  return compactionMinutes * 60 * 1_000
}

function unionMilliseconds(entries: readonly TimeLogEntry[]): number {
  const intervals = [...entries].sort((left, right) => left.startAtMs - right.startAtMs)
  let totalMilliseconds = 0
  let currentStartAtMs: number | undefined
  let currentEndAtMs: number | undefined

  for (const entry of intervals) {
    if (currentStartAtMs === undefined || currentEndAtMs === undefined) {
      currentStartAtMs = entry.startAtMs
      currentEndAtMs = entry.endAtMs
      continue
    }

    if (entry.startAtMs > currentEndAtMs) {
      totalMilliseconds += currentEndAtMs - currentStartAtMs
      currentStartAtMs = entry.startAtMs
      currentEndAtMs = entry.endAtMs
      continue
    }

    currentEndAtMs = Math.max(currentEndAtMs, entry.endAtMs)
  }

  if (currentStartAtMs !== undefined && currentEndAtMs !== undefined) {
    totalMilliseconds += currentEndAtMs - currentStartAtMs
  }

  return totalMilliseconds
}

function compareRows(left: CompactedTimeLogRow, right: CompactedTimeLogRow): number {
  if (left.bucketStartAtMs !== right.bucketStartAtMs) {
    return left.bucketStartAtMs - right.bucketStartAtMs
  }
  return left.repositoryId.localeCompare(right.repositoryId)
}
