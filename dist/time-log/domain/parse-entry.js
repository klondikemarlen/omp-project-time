import { parseActivityLabel } from "../../time-log/domain/activity.js";
import { isFiniteNumber } from "../../utils/is-finite-number.js";

export function parseTimeLogEntry(value) {
  if (typeof value !== "object" || value === null) return undefined;
  const candidate = value;
  const id = candidate.id;
  const sourceKind = parseSourceKind(candidate.sourceKind);
  const project = candidate.project;
  const repositoryId = candidate.repositoryId;
  const sessionId = candidate.sessionId;
  const startAtMs = candidate.startAtMs;
  const endAtMs = candidate.endAtMs;
  const createdAtMs = candidate.createdAtMs;
  const activity = parseActivityLabel(candidate.activity);
  if (
    typeof id !== "string" ||
    id.length === 0 ||
    sourceKind === undefined ||
    typeof project !== "string" ||
    project.length === 0 ||
    typeof repositoryId !== "string" ||
    repositoryId.length === 0 ||
    (sessionId !== undefined &&
      (typeof sessionId !== "string" || sessionId.length === 0)) ||
    !isFiniteNumber(startAtMs) ||
    !isFiniteNumber(endAtMs) ||
    startAtMs >= endAtMs ||
    !isFiniteNumber(createdAtMs) ||
    (candidate.activity !== undefined && activity === undefined) ||
    "attribution" in candidate
  ) {
    return undefined;
  }
  return {
    id,
    sourceKind,
    project,
    repositoryId,
    ...(sessionId === undefined ? {} : { sessionId }),
    ...(activity === undefined ? {} : { activity }),
    startAtMs,
    endAtMs,
    createdAtMs,
  };
}

function parseSourceKind(value) {
  if (value === "human_active" || value === "agent_turn_elapsed") return value;
  return undefined;
}

export default parseTimeLogEntry;
