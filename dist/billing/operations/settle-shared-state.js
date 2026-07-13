import Big from "../../vendor/big.js";
import { costForActiveMs } from "../../billing/calculation/cost-for-active-time.js";

export function settleSpreadDeveloperCostStates(sessions, nowMs) {
  const activeWindows = sessions.flatMap(({ state }) => {
    if (
      state.activeStartAtMs === undefined ||
      state.activeUntilMs === undefined
    )
      return [];
    return [
      {
        startAtMs: state.activeStartAtMs,
        untilMs: state.activeUntilMs,
      },
    ];
  });
  return sessions.map((session) => ({
    ...session,
    state: settleSpreadDeveloperCostState(
      session.state,
      session.config,
      activeWindows,
      nowMs,
    ),
  }));
}

function settleSpreadDeveloperCostState(state, config, activeWindows, nowMs) {
  const nextState = { ...state };
  if (
    nextState.activeStartAtMs === undefined ||
    nextState.activeUntilMs === undefined
  ) {
    return nextState;
  }
  const settleFromMs = nextState.lastSettledAtMs ?? nextState.activeStartAtMs;
  const settleUntilMs = Math.min(nowMs, nextState.activeUntilMs);
  const splitPoints = activeWindows
    .flatMap(({ startAtMs, untilMs }) => [startAtMs, untilMs])
    .filter((pointMs) => pointMs > settleFromMs && pointMs < settleUntilMs)
    .sort((left, right) => left - right);
  const boundaries = [...new Set([...splitPoints, settleUntilMs])];
  let segmentStartMs = settleFromMs;
  for (const segmentUntilMs of boundaries) {
    const elapsedMs = segmentUntilMs - segmentStartMs;
    const activeSessionCount = activeWindows.filter(
      ({ startAtMs, untilMs }) =>
        startAtMs <= segmentStartMs && segmentStartMs < untilMs,
    ).length;
    if (elapsedMs > 0 && activeSessionCount > 0) {
      const elapsedCost = costForActiveMs(config, elapsedMs).div(
        activeSessionCount,
      );
      nextState.totalCost = Big(nextState.totalCost)
        .plus(elapsedCost)
        .toString();
      nextState.activeMilliseconds += elapsedMs;
    }
    segmentStartMs = segmentUntilMs;
  }
  if (settleUntilMs > settleFromMs) {
    nextState.lastSettledAtMs = settleUntilMs;
  }
  if (nowMs < nextState.activeUntilMs) return nextState;
  delete nextState.activeStartAtMs;
  delete nextState.activeUntilMs;
  delete nextState.lastSettledAtMs;
  return nextState;
}

export default settleSpreadDeveloperCostStates;
