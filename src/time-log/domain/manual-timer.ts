import { parseActivityLabel } from "@/time-log/domain/activity.js"
import type { ManualTimer } from "@/time-log/domain/model.js"
import { parseIanaTimeZone } from "@/utils/parse-iana-time-zone.js"
import { parseRepositoryIdentity } from "@/utils/parse-repository-identity.js"
import { isFiniteNumber } from "@/utils/is-finite-number.js"

export function parseManualTimer(value: unknown): ManualTimer | undefined {
  if (typeof value !== "object" || value === null) return undefined

  const candidate = value as Record<string, unknown>
  const id = candidate.id
  const project = candidate.project
  const repositoryId = candidate.repositoryId
  const repositoryIdentity = parseRepositoryIdentity(candidate.repositoryIdentity)
  const activity = parseActivityLabel(candidate.activity)
  const startAtMs = candidate.startAtMs
  const timeZone = parseIanaTimeZone(candidate.timeZone)

  if (
    typeof project !== "string"
    || project.trim() === ""
    || typeof repositoryId !== "string"
    || repositoryId.trim() === ""
    || (candidate.repositoryIdentity !== undefined && repositoryIdentity === undefined)
    || (candidate.activity !== undefined && activity === undefined)
    || !isFiniteNumber(startAtMs)
    || typeof id !== "string"
    || id.trim() === ""
    || timeZone === undefined
  ) {
    return undefined
  }

  return {
    id: id.trim(),
    project: project.trim(),
    repositoryId: repositoryId.trim(),
    ...(repositoryIdentity === undefined ? {} : { repositoryIdentity }),
    ...(activity === undefined ? {} : { activity }),
    startAtMs,
    timeZone,
  }
}
