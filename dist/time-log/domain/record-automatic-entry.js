import { createHash } from "node:crypto";

export function recordAutomaticTimeLogEntry(
  entries,
  input,
  createdAtMs = Date.now(),
) {
  const entry = createTimeLogEntry(input, createdAtMs);
  const existingIndex = entries.findIndex(
    (candidate) => candidate.id === entry.id,
  );
  if (existingIndex === -1) {
    entries.push(entry);
    return { changed: true, entry };
  }
  const existingEntry = entries[existingIndex];
  if (entry.endAtMs <= existingEntry.endAtMs) {
    return { changed: false, entry: existingEntry };
  }
  const extendedEntry = { ...existingEntry, endAtMs: entry.endAtMs };
  entries[existingIndex] = extendedEntry;
  return { changed: true, entry: extendedEntry };
}

function createTimeLogEntry(input, createdAtMs) {
  const project = input.project.trim();
  const repositoryId = input.repositoryId.trim();
  const sourceKey = input.sourceKey.trim();
  const { startAtMs, endAtMs, sourceKind, sessionId, attribution } = input;
  if (project.length === 0) throw new Error("Time log project is required.");
  if (repositoryId.length === 0) {
    throw new Error("Time log repository identity is required.");
  }
  if (sourceKey.length === 0) {
    throw new Error("Time log source key is required.");
  }
  if (
    !Number.isFinite(startAtMs) ||
    !Number.isFinite(endAtMs) ||
    startAtMs >= endAtMs
  ) {
    throw new Error("Time log timestamps must define a positive interval.");
  }
  return {
    id: `auto-${createHash("sha256").update(sourceKey).digest("hex")}`,
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

export default recordAutomaticTimeLogEntry;
