import type { TimeLogEntry } from "@/time-log/domain/model.js"
import { isFiniteNumber } from "@/utils/is-finite-number.js"

export function parseTimeLogEntry(value: unknown): TimeLogEntry | undefined {
  if (typeof value !== "object" || value === null) return undefined

  const id = "id" in value ? value.id : undefined
  const project = "project" in value ? value.project : undefined
  const repositoryId = "repositoryId" in value ? value.repositoryId : undefined
  const startAtMs = "startAtMs" in value ? value.startAtMs : undefined
  const endAtMs = "endAtMs" in value ? value.endAtMs : undefined
  const createdAtMs = "createdAtMs" in value ? value.createdAtMs : undefined

  if (
    typeof id !== "string" ||
    id.length === 0 ||
    typeof project !== "string" ||
    project.length === 0 ||
    typeof repositoryId !== "string" ||
    repositoryId.length === 0 ||
    !isFiniteNumber(startAtMs) ||
    !isFiniteNumber(endAtMs) ||
    startAtMs >= endAtMs ||
    !isFiniteNumber(createdAtMs)
  ) {
    return undefined
  }

  return { id, project, repositoryId, startAtMs, endAtMs, createdAtMs }
}

export default parseTimeLogEntry
