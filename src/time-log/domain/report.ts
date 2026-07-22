import type { TimeLogEntry, SourceKind } from "@/time-log/domain/model.js"

export type AllocationMode = "raw" | "split" | "weighted"

export type ReportEntry = {
  mode: AllocationMode
  sourceKind: SourceKind
  repositoryId: string
  project: string
  durationMs: number
}

export type Report = {
  sourceKind: SourceKind
  mode: AllocationMode
  ompActiveUnionMs: number
  entries: ReportEntry[]
}

export function buildReport(
  entries: readonly TimeLogEntry[],
  sourceKind: SourceKind,
  mode: AllocationMode,
  weights?: Readonly<Record<string, number>>,
  project?: string,
): Report {
  const sourceEntries = entries.filter((entry) => entry.sourceKind === sourceKind)
  const scopedEntries = project === undefined
    ? sourceEntries
    : sourceEntries.filter((entry) => entry.project === project)

  if (mode === "raw") {
    return {
      sourceKind,
      mode,
      ompActiveUnionMs: unionMilliseconds(scopedEntries),
      entries: repositoryEntries(scopedEntries, sourceKind, mode),
    }
  }

  return splitWeightedReport(sourceEntries, sourceKind, mode, weights, project)
}

function repositoryEntries(
  entries: readonly TimeLogEntry[],
  sourceKind: SourceKind,
  mode: AllocationMode,
): ReportEntry[] {
  const totals = new Map<string, ReportEntry>()

  for (const entry of entries) {
    const key = entry.repositoryId
    const durationMs = entry.endAtMs - entry.startAtMs
    const existing = totals.get(key)

    if (existing === undefined) {
      totals.set(key, {
        mode,
        sourceKind,
        repositoryId: entry.repositoryId,
        project: entry.project,
        durationMs,
      })
    } else {
      existing.durationMs += durationMs
    }
  }

  return [...totals.values()]
}

function splitWeightedReport(
  entries: readonly TimeLogEntry[],
  sourceKind: SourceKind,
  mode: AllocationMode,
  weights?: Readonly<Record<string, number>>,
  project?: string,
): Report {
  if (
    mode === "weighted"
    && Object.values(weights ?? {}).some((weight) => !Number.isFinite(weight) || weight <= 0)
  ) {
    throw new Error("Report weights must be positive finite numbers.")
  }

  const scopedEntries = project === undefined
    ? entries
    : entries.filter((entry) => entry.project === project)
  const segments = segmentEntries(entries)
  const splitTotals = new Map<string, ReportEntry>()
  const weightedTotals = new Map<string, ReportEntry>()

  for (const segment of segments) {
    const duration = segment.endAtMs - segment.startAtMs
    if (duration <= 0) continue


    const active = segment.entries
    if (active.length === 0) continue

    const equalShare = duration / active.length
    const weightSum = active.reduce(
      (sum, entry) => sum + (weights?.[entry.repositoryId] ?? 1),
      0,
    )

    for (const entry of active) {
      if (project !== undefined && entry.project !== project) continue
      const key = entry.repositoryId
      const weight = weights?.[entry.repositoryId] ?? 1
      const weightedShare =
        weightSum > 0 ? duration * weight / weightSum : equalShare

      addDuration(splitTotals, key, {
        mode: "split",
        sourceKind,
        repositoryId: entry.repositoryId,
        project: entry.project,
        durationMs: equalShare,
      })
      addDuration(weightedTotals, key, {
        mode: "weighted",
        sourceKind,
        repositoryId: entry.repositoryId,
        project: entry.project,
        durationMs: weightedShare,
      })
    }
  }

  const totals = mode === "split" ? splitTotals : weightedTotals

  return {
    sourceKind,
    mode,
    ompActiveUnionMs: unionMilliseconds(scopedEntries),
    entries: [...totals.values()],
  }
}

function segmentEntries(
  entries: readonly TimeLogEntry[],
): Array<{ startAtMs: number; endAtMs: number; entries: TimeLogEntry[] }> {
  type Event = {
    at: number
    entry: TimeLogEntry
    isStart: boolean
  }

  const events: Event[] = []
  for (const entry of entries) {
    events.push({ at: entry.startAtMs, entry, isStart: true })
    events.push({ at: entry.endAtMs, entry, isStart: false })
  }

  events.sort((left, right) => {
    if (left.at !== right.at) return left.at - right.at
    return left.isStart ? 1 : -1
  })

  const active = new Set<TimeLogEntry>()
  let segmentStart: number | undefined
  const segments: Array<{ startAtMs: number; endAtMs: number; entries: TimeLogEntry[] }> = []

  for (const event of events) {
    if (segmentStart !== undefined && event.at > segmentStart) {
      segments.push({
        startAtMs: segmentStart,
        endAtMs: event.at,
        entries: [...active],
      })
    }

    if (event.isStart) active.add(event.entry)
    else active.delete(event.entry)

    if (active.size > 0) segmentStart = event.at
    else segmentStart = undefined
  }

  return segments
}

function unionMilliseconds(entries: readonly TimeLogEntry[]): number {
  const intervals = [...entries].sort(
    (left, right) => left.startAtMs - right.startAtMs,
  )
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



function addDuration(
  totals: Map<string, ReportEntry>,
  key: string,
  template: ReportEntry,
): void {
  const existing = totals.get(key)
  if (existing === undefined) {
    totals.set(key, { ...template })
  } else {
    existing.durationMs += template.durationMs
  }
}
