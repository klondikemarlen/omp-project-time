import Big from "big.js";
import { costForActiveMs } from "../calculation/cost-for-active-time.js";
export function settleDeveloperCostState(state, nowMs, config) {
    const nextState = { ...state };
    if (nextState.activeStartAtMs === undefined || nextState.activeUntilMs === undefined) {
        return nextState;
    }
    const settleFromMs = nextState.lastSettledAtMs ?? nextState.activeStartAtMs;
    const settleUntilMs = Math.min(nowMs, nextState.activeUntilMs);
    const elapsedMs = Math.max(0, settleUntilMs - settleFromMs);
    if (elapsedMs > 0) {
        const elapsedCost = costForActiveMs(config, elapsedMs);
        nextState.totalCost = Big(nextState.totalCost).plus(elapsedCost).toString();
        nextState.activeMilliseconds += elapsedMs;
        nextState.lastSettledAtMs = settleUntilMs;
    }
    if (nowMs < nextState.activeUntilMs) {
        return nextState;
    }
    delete nextState.activeStartAtMs;
    delete nextState.activeUntilMs;
    delete nextState.lastSettledAtMs;
    return nextState;
}
