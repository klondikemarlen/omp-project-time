import type { TimeLogEntry, SourceKind } from "@/time-log/domain/model.js"
import { parseActivityLabel } from "@/time-log/domain/activity.js"
import { parseActivityNarrative } from "@/time-log/domain/narrative.js"
import { isFiniteNumber } from "@/utils/is-finite-number.js"
import { parseRepositoryIdentity } from "@/utils/parse-repository-identity.js"

export function parseTimeLogEntry(value: unknown): TimeLogEntry | undefined {
  if (typeof value !== "object" || value === null) return undefined

  const candidate = value as Record<string, unknown>
  const id = candidate.id
  const sourceKind = parseSourceKind(candidate.sourceKind)
  const project = candidate.project
  const repositoryId = candidate.repositoryId
  const repositoryIdentity = parseRepositoryIdentity(candidate.repositoryIdentity)
  const sessionId = candidate.sessionId
  const startAtMs = candidate.startAtMs
  const endAtMs = candidate.endAtMs
  const createdAtMs = candidate.createdAtMs
  const activity = parseActivityLabel(candidate.activity)
  const narrative = parseActivityNarrative(candidate.narrative)

  if (
    typeof id !== "string"
    || id.length === 0
    || sourceKind === undefined
    || typeof project !== "string"
    || project.length === 0
    || typeof repositoryId !== "string"
    || repositoryId.length === 0
    || (candidate.repositoryIdentity !== undefined && repositoryIdentity === undefined)
    || (sessionId !== undefined
      && (typeof sessionId !== "string" || sessionId.length === 0))
    || !isFiniteNumber(startAtMs)
    || !isFiniteNumber(endAtMs)
    || startAtMs >= endAtMs
    || !isFiniteNumber(createdAtMs)
    || (candidate.activity !== undefined && activity === undefined)
    || (candidate.narrative !== undefined && narrative === undefined)
    || "attribution" in candidate
  ) {
    return undefined
  }

  return {
    id,
    sourceKind,
    project,
    repositoryId,
    ...(repositoryIdentity === undefined ? {} : { repositoryIdentity }),
    ...(sessionId === undefined ? {} : { sessionId }),
    ...(activity === undefined ? {} : { activity }),
    ...(narrative === undefined ? {} : { narrative }),
    startAtMs,
    endAtMs,
    createdAtMs,
  }
}

function parseSourceKind(value: unknown): SourceKind | undefined {
  if (value === "human_active" || value === "agent_turn_elapsed") return value

  return undefined
}


export default parseTimeLogEntry
