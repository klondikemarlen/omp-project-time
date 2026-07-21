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
  const activityStartedAtMs = options.activityStartedAtMs;
  const entryStartAtMs = Math.max(startAtMs, activityStartedAtMs ?? startAtMs);
  if (entryStartAtMs >= settledUntilMs) return undefined;
  return {
    sourceKind: "human_active",
    project: options.repository.project,
    repositoryId: options.repository.repositoryId,
    ...(options.repository.repositoryIdentity === undefined
      ? {}
      : { repositoryIdentity: options.repository.repositoryIdentity }),
    sessionId: options.sessionId,
    ...(options.activity === undefined ? {} : { activity: options.activity }),
    ...(options.narrative === undefined
      ? {}
      : { narrative: options.narrative }),
    sourceKey: `${options.sessionId}:${options.repository.repositoryId}:${options.sourceStartedAtMs}:${activityStartedAtMs ?? options.sourceStartedAtMs}`,
    startAtMs: entryStartAtMs,
    endAtMs: settledUntilMs,
  };
}

export default createAutomaticTimeLogEntry;
