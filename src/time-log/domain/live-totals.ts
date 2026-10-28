import type { SourceKind, TimeLogEntry } from "@/time-log/domain/model.js";

export type LiveInterval = {
  startAtMs: number;
  endAtMs: number;
};

export type LiveTimeTotals = {
  humanMilliseconds: number;
  agentMilliseconds: number;
};

export function liveTimeTotals(
  entries: readonly TimeLogEntry[],
  sessionId: string,
  project: string,
  observedAtMs: number,
  openHumanInterval?: LiveInterval,
  openAgentInterval?: LiveInterval,
): LiveTimeTotals | undefined {
  if (
    sessionId.trim() === "" ||
    project.trim() === "" ||
    !Number.isFinite(observedAtMs)
  ) {
    return undefined;
  }

  const humanIntervals: LiveInterval[] = [];
  const agentIntervals: LiveInterval[] = [];

  for (const entry of entries) {
    if (entry.sessionId !== sessionId || entry.project !== project) continue;

    const intervals = intervalsForSource(
      entry.sourceKind,
      humanIntervals,
      agentIntervals,
    );
    if (intervals === undefined) continue;

    addObservedInterval(
      intervals,
      entry.startAtMs,
      entry.endAtMs,
      observedAtMs,
    );
  }

  if (openHumanInterval !== undefined) {
    addObservedInterval(
      humanIntervals,
      openHumanInterval.startAtMs,
      openHumanInterval.endAtMs,
      observedAtMs,
    );
  }

  if (openAgentInterval !== undefined) {
    addObservedInterval(
      agentIntervals,
      openAgentInterval.startAtMs,
      openAgentInterval.endAtMs,
      observedAtMs,
    );
  }

  const humanMilliseconds = unionMilliseconds(humanIntervals);
  const agentMilliseconds = unionMilliseconds(agentIntervals);
  if (
    !Number.isFinite(humanMilliseconds) ||
    !Number.isFinite(agentMilliseconds)
  ) {
    return undefined;
  }

  return { humanMilliseconds, agentMilliseconds };
}

function intervalsForSource(
  sourceKind: SourceKind,
  humanIntervals: LiveInterval[],
  agentIntervals: LiveInterval[],
): LiveInterval[] | undefined {
  if (sourceKind === "human_active") return humanIntervals;
  if (sourceKind === "agent_turn_elapsed") return agentIntervals;
  return undefined;
}

function addObservedInterval(
  intervals: LiveInterval[],
  startAtMs: number,
  endAtMs: number,
  observedAtMs: number,
): void {
  const observedEndAtMs = Math.min(endAtMs, observedAtMs);
  if (
    !Number.isFinite(startAtMs) ||
    !Number.isFinite(endAtMs) ||
    observedEndAtMs <= startAtMs
  ) {
    return;
  }

  intervals.push({ startAtMs, endAtMs: observedEndAtMs });
}

function unionMilliseconds(intervals: LiveInterval[]): number {
  if (intervals.length === 0) return 0;

  intervals.sort(
    (left, right) =>
      left.startAtMs - right.startAtMs || left.endAtMs - right.endAtMs,
  );

  let totalMilliseconds = 0;
  let intervalStartAtMs = intervals[0]?.startAtMs ?? 0;
  let intervalEndAtMs = intervals[0]?.endAtMs ?? 0;

  for (let index = 1; index < intervals.length; index += 1) {
    const interval = intervals[index];
    if (interval === undefined) continue;

    if (interval.startAtMs > intervalEndAtMs) {
      totalMilliseconds += intervalEndAtMs - intervalStartAtMs;
      intervalStartAtMs = interval.startAtMs;
      intervalEndAtMs = interval.endAtMs;
      continue;
    }

    intervalEndAtMs = Math.max(intervalEndAtMs, interval.endAtMs);
  }

  return totalMilliseconds + intervalEndAtMs - intervalStartAtMs;
}

export default liveTimeTotals;
