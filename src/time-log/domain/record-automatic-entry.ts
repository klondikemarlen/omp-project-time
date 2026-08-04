import { createHash } from "node:crypto"
import { parseActivityLabel } from "@/time-log/domain/activity.js"
import { parseActivityNarrative } from "@/time-log/domain/narrative.js"
import { parseWorkItem } from "@/time-log/domain/work-item.js"
import { parseRepositoryIdentity } from "@/utils/parse-repository-identity.js"
import { parseIanaTimeZone } from "@/utils/parse-iana-time-zone.js"

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
  const addsRepositoryIdentity =
    existingEntry.repositoryIdentity === undefined
    && entry.repositoryIdentity !== undefined
  const extendsEntry = entry.endAtMs > existingEntry.endAtMs
  if (!addsRepositoryIdentity && !extendsEntry) {
    return { changed: false, entry: existingEntry }
  }

  const updatedEntry = {
    ...existingEntry,
    ...(addsRepositoryIdentity ? { repositoryIdentity: entry.repositoryIdentity } : {}),
    ...(extendsEntry ? { endAtMs: entry.endAtMs } : {}),
  }
  entries[existingIndex] = updatedEntry
  return { changed: true, entry: updatedEntry }
}

function createTimeLogEntry(
  input: AutomaticTimeLogInput,
  createdAtMs: number,
): TimeLogEntry {
  const project = input.project.trim()
  const repositoryId = input.repositoryId.trim()
  const repositoryIdentity = parseRepositoryIdentity(input.repositoryIdentity)
  const sourceKey = input.sourceKey.trim()
  const { startAtMs, endAtMs, sourceKind, sessionId, timeZone: inputTimeZone } = input
  const activity = parseActivityLabel(input.activity)
  const narrative = parseActivityNarrative(input.narrative)
  const workItem = parseWorkItem(input.workItem)
  const timeZone = parseIanaTimeZone(inputTimeZone)
  if (input.activity !== undefined && activity === undefined) {
    throw new Error("Time log activity label is invalid.")
  }
  if (input.narrative !== undefined && narrative === undefined) {
    throw new Error("Time log narrative is invalid.")
  }
  if (input.workItem !== undefined && workItem === undefined) {
    throw new Error("Time log work item is invalid.")
  }
  if (sourceKind === "manual_tracked" && timeZone === undefined) {
    throw new Error("Manual time log entries require an IANA time zone.")
  }
  if (sourceKind !== "manual_tracked" && inputTimeZone !== undefined) {
    throw new Error("Only manual time log entries retain a time zone.")
  }

  if (input.repositoryIdentity !== undefined && repositoryIdentity === undefined) {
    throw new Error("Time log repository identity is invalid.")
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
    ...(repositoryIdentity === undefined ? {} : { repositoryIdentity }),
    ...(sessionId === undefined ? {} : { sessionId }),
    ...(activity === undefined ? {} : { activity }),
    ...(narrative === undefined ? {} : { narrative }),
    ...(workItem === undefined ? {} : { workItem }),
    ...(timeZone === undefined ? {} : { timeZone }),
    startAtMs,
    endAtMs,
    createdAtMs,
  }
}

export default recordAutomaticTimeLogEntry
