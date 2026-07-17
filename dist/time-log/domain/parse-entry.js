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
  const attribution =
    parseAttribution(candidate.attribution) ??
    parseAttribution(candidate.timesheet);
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
    !isFiniteNumber(createdAtMs)
  ) {
    return undefined;
  }
  return {
    id,
    sourceKind,
    project,
    repositoryId,
    ...(sessionId === undefined ? {} : { sessionId }),
    startAtMs,
    endAtMs,
    createdAtMs,
    ...(attribution === undefined ? {} : { attribution }),
  };
}

function parseSourceKind(value) {
  if (value === undefined) return "human_active";
  if (value === "human_active" || value === "agent_turn_elapsed") return value;
  return undefined;
}

function parseAttribution(value) {
  if (typeof value !== "object" || value === null) return undefined;
  const { projectId, projectName, categoryId, categoryLabel, task } = value;
  if (
    typeof projectId !== "string" ||
    projectId.length === 0 ||
    typeof projectName !== "string" ||
    projectName.length === 0 ||
    typeof categoryId !== "string" ||
    categoryId.length === 0 ||
    typeof categoryLabel !== "string" ||
    categoryLabel.length === 0
  ) {
    return undefined;
  }
  return {
    projectId,
    projectName,
    categoryId,
    categoryLabel,
    ...(task !== undefined && typeof task === "string" && task.length > 0
      ? { task }
      : {}),
  };
}

export default parseTimeLogEntry;
