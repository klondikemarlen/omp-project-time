import { parseTimeLogEntry } from "../../time-log/domain/parse-entry.js";

export const TIME_LOG_EVIDENCE_FORMAT = "omp-project-time/evidence";
export const TIME_LOG_EVIDENCE_VERSION = 1;
export function formatTimeLogEvidence(entries, project) {
  return JSON.stringify(
    {
      format: TIME_LOG_EVIDENCE_FORMAT,
      version: TIME_LOG_EVIDENCE_VERSION,
      entries:
        project === undefined
          ? entries
          : entries.filter((entry) => entry.project === project),
    },
    null,
    2,
  );
}

export function parseTimeLogState(value) {
  if (
    typeof value !== "object" ||
    value === null ||
    !("entries" in value) ||
    !Array.isArray(value.entries)
  ) {
    return undefined;
  }
  const candidate = value;
  if (
    (candidate.format !== undefined || candidate.version !== undefined) &&
    (candidate.format !== TIME_LOG_EVIDENCE_FORMAT ||
      candidate.version !== TIME_LOG_EVIDENCE_VERSION)
  ) {
    return undefined;
  }
  const entries = [];
  for (const valueEntry of value.entries) {
    const entry = parseTimeLogEntry(valueEntry);
    if (entry === undefined) {
      if (isObsoleteManualEntry(valueEntry)) continue;
      return undefined;
    }
    entries.push(entry);
  }
  return {
    format: TIME_LOG_EVIDENCE_FORMAT,
    version: TIME_LOG_EVIDENCE_VERSION,
    entries,
  };
}

function isObsoleteManualEntry(value) {
  return (
    typeof value === "object" &&
    value !== null &&
    "sourceKind" in value &&
    value.sourceKind === "manual_tracked"
  );
}
