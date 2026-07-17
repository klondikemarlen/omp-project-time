import { isFiniteNumber } from "../../utils/is-finite-number.js";

export function parseTimeLogEntry(value) {
  if (typeof value !== "object" || value === null) return undefined;
  const id = "id" in value ? value.id : undefined;
  const project = "project" in value ? value.project : undefined;
  const repositoryId = "repositoryId" in value ? value.repositoryId : undefined;
  const sessionId = "sessionId" in value ? value.sessionId : undefined;
  const startAtMs = "startAtMs" in value ? value.startAtMs : undefined;
  const endAtMs = "endAtMs" in value ? value.endAtMs : undefined;
  const createdAtMs = "createdAtMs" in value ? value.createdAtMs : undefined;
  const timesheet =
    "timesheet" in value
      ? parseTimesheetAttribution(value.timesheet)
      : undefined;
  if (
    typeof id !== "string" ||
    id.length === 0 ||
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
    ("timesheet" in value && timesheet === undefined)
  ) {
    return undefined;
  }
  return {
    id,
    project,
    repositoryId,
    ...(sessionId === undefined ? {} : { sessionId }),
    startAtMs,
    endAtMs,
    createdAtMs,
    ...(timesheet === undefined ? {} : { timesheet }),
  };
}

function parseTimesheetAttribution(value) {
  if (typeof value !== "object" || value === null) return undefined;
  const { projectId, projectName, categoryId, categoryLabel } = value;
  return typeof projectId === "string" &&
    projectId.length > 0 &&
    typeof projectName === "string" &&
    projectName.length > 0 &&
    typeof categoryId === "string" &&
    categoryId.length > 0 &&
    typeof categoryLabel === "string" &&
    categoryLabel.length > 0
    ? { projectId, projectName, categoryId, categoryLabel }
    : undefined;
}

export default parseTimeLogEntry;
