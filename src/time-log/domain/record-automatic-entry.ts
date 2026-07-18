import { createHash } from "node:crypto"
import { parseActivityLabel } from "@/time-log/domain/activity.js"

import type {
  AutomaticTimeLogInput,
  TimeLogEntry,
} from "@/time-log/domain/model.js"

export type RecordedAutomaticTimeLogEntry = {
  changed: boolean
  entry: TimeLogEntry
}

export function recordAutomaticTimeLogEntry(
  entries: TimeLogEntry[],
  input: AutomaticTimeLogInput,
  createdAtMs = Date.now(),
): RecordedAutomaticTimeLogEntry {
  const entry = createTimeLogEntry(input, createdAtMs)
  const existingIndex = entries.findIndex((candidate) => candidate.id === entry.id)
  if (existingIndex === -1) {
    entries.push(entry)
    return { changed: true, entry }
  }

  const existingEntry = entries[existingIndex]
  if (entry.endAtMs <= existingEntry.endAtMs) {
    return { changed: false, entry: existingEntry }
  }

  const extendedEntry = { ...existingEntry, endAtMs: entry.endAtMs }
  entries[existingIndex] = extendedEntry
  return { changed: true, entry: extendedEntry }
}

function createTimeLogEntry(
  input: AutomaticTimeLogInput,
  createdAtMs: number,
): TimeLogEntry {
  const project = input.project.trim()
  const repositoryId = input.repositoryId.trim()
  const sourceKey = input.sourceKey.trim()
  const { startAtMs, endAtMs, sourceKind, sessionId } = input
  const activity = parseActivityLabel(input.activity)
  if (input.activity !== undefined && activity === undefined) {
    throw new Error("Time log activity label is invalid.")
  }

  if (project.length === 0) throw new Error("Time log project is required.")
  if (repositoryId.length === 0) {
    throw new Error("Time log repository identity is required.")
  }
  if (sourceKey.length === 0) {
    throw new Error("Time log source key is required.")
  }
  if (
    !Number.isFinite(startAtMs)
    || !Number.isFinite(endAtMs)
    || startAtMs >= endAtMs
  ) {
    throw new Error("Time log timestamps must define a positive interval.")
  }

  return {
    id: `auto-${createHash("sha256").update(sourceKey).digest("hex")}`,
    sourceKind,
    project,
    repositoryId,
    ...(sessionId === undefined ? {} : { sessionId }),
    ...(activity === undefined ? {} : { activity }),
    startAtMs,
    endAtMs,
    createdAtMs,
  }
}

export default recordAutomaticTimeLogEntry
