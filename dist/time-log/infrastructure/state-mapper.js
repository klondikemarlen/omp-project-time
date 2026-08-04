import { parseTimeLogEntry } from "../../time-log/domain/parse-entry.js";
import { parseManualTimer } from "../../time-log/domain/manual-timer.js";

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
  const entries = [];
  for (const valueEntry of value.entries) {
    const entry = parseTimeLogEntry(valueEntry);
    if (entry === undefined) return undefined;
    entries.push(entry);
  }
  const activeManualTimer =
    candidate.activeManualTimer === undefined
      ? undefined
      : parseManualTimer(candidate.activeManualTimer);
  if ("activeManualTimer" in candidate && activeManualTimer === undefined) {
    return undefined;
  }
  return {
    entries,
    ...(activeManualTimer === undefined ? {} : { activeManualTimer }),
  };
}
