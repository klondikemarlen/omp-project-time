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
  const previouslySettledAtMs =
    stateBeforeSettlement.lastSettledAtMs ??
    stateBeforeSettlement.activeStartAtMs;
  const settledFromMs = Math.max(
    previouslySettledAtMs,
    stateBeforeSettlement.activeStartAtMs,
  );
  const startAtMs = Math.max(
    settledFromMs,
    settledUntilMs - settledMilliseconds,
  );
  if (startAtMs >= settledUntilMs) return undefined;
  return {
    project: options.repository.project,
    repositoryId: options.repository.repositoryId,
    sourceKey: `${options.sessionId}:${options.repository.repositoryId}:${options.sourceStartedAtMs}`,
    startAtMs,
    endAtMs: settledUntilMs,
  };
}
