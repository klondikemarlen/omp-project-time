export function createAutomaticTimeLogEntry(options) {
  const stateBeforeSettlement = options.stateBeforeSettlement;
  if (
    stateBeforeSettlement.activeStartAtMs === undefined ||
    stateBeforeSettlement.activeUntilMs === undefined
  ) {
    return undefined;
  }
  const settledMilliseconds =
    options.settledState.activeMilliseconds -
    stateBeforeSettlement.activeMilliseconds;
  if (settledMilliseconds <= 0) return undefined;
  const settledUntilMs = Math.min(
    options.nowMs,
    stateBeforeSettlement.activeUntilMs,
  );
  const startAtMs = Math.max(
    stateBeforeSettlement.activeStartAtMs,
    settledUntilMs - settledMilliseconds,
  );
  if (startAtMs >= settledUntilMs) return undefined;
  return {
    sourceKind: "human_active",
    project: options.repository.project,
    repositoryId: options.repository.repositoryId,
    sessionId: options.sessionId,
    sourceKey: `${options.sessionId}:${options.repository.repositoryId}:${options.sourceStartedAtMs}`,
    startAtMs,
    endAtMs: settledUntilMs,
  };
}

export default createAutomaticTimeLogEntry;
