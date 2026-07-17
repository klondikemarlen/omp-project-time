import type { BillableDescription } from "@/billable-time/domain/description.js"
import type { TimeLogEntry } from "@/time-log/domain/model.js"

export type TimesheetEntry = {
  sessionId: string
  repositoryId: string
  projectId: string
  projectName: string
  categoryId: string
  categoryLabel: string
  task: string
  durationMs: number
  startedAtMs: number
  endedAtMs: number
}

export function createTimesheetEntries(
  intervals: readonly TimeLogEntry[],
  descriptions: readonly BillableDescription[],
): TimesheetEntry[] {
  const tasksBySession = latestDescriptionsBySession(descriptions)
  const entries = new Map<string, TimesheetEntry>()

  for (const interval of intervals) {
    if (interval.sessionId === undefined || interval.timesheet === undefined) continue

    const task = tasksBySession.get(interval.sessionId)?.description ?? "Unlabeled project work"
    const { projectId, projectName, categoryId, categoryLabel } = interval.timesheet
    const key = [
      interval.sessionId,
      interval.repositoryId,
      projectId,
      categoryId,
      task,
    ].join("\u0000")
    const existing = entries.get(key)
    const durationMs = interval.endAtMs - interval.startAtMs

    if (existing === undefined) {
      entries.set(key, {
        sessionId: interval.sessionId,
        repositoryId: interval.repositoryId,
        projectId,
        projectName,
        categoryId,
        categoryLabel,
        task,
        durationMs,
        startedAtMs: interval.startAtMs,
        endedAtMs: interval.endAtMs,
      })
      continue
    }

    entries.set(key, {
      ...existing,
      durationMs: existing.durationMs + durationMs,
      startedAtMs: Math.min(existing.startedAtMs, interval.startAtMs),
      endedAtMs: Math.max(existing.endedAtMs, interval.endAtMs),
    })
  }

  return [...entries.values()]
}

export function timesheetPreview(entries: readonly TimesheetEntry[]): string {
  return JSON.stringify(entries.map((entry) => ({
    session_id: entry.sessionId,
    repository_id: entry.repositoryId,
    project_id: entry.projectId,
    project_name: entry.projectName,
    category_id: entry.categoryId,
    category_label: entry.categoryLabel,
    task: entry.task,
    duration_ms: entry.durationMs,
    started_at_ms: entry.startedAtMs,
    ended_at_ms: entry.endedAtMs,
  })), null, 2)
}

function latestDescriptionsBySession(
  descriptions: readonly BillableDescription[],
): ReadonlyMap<string, BillableDescription> {
  const latest = new Map<string, BillableDescription>()

  for (const description of descriptions) {
    const existing = latest.get(description.sessionId)
    if (existing === undefined || existing.recordedAtMs <= description.recordedAtMs) {
      latest.set(description.sessionId, description)
    }
  }

  return latest
}
