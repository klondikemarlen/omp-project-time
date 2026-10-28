import type { SourceKind, TimeLogEntry } from "@/time-log/domain/model.js";

export type LiveInterval = {
  startAtMs: number;
  endAtMs: number;
};

export type LiveTimeTotals = {
  humanMilliseconds: number;
  agentMilliseconds: number;
  todayHumanMilliseconds: number;
  todayAgentMilliseconds: number;
};

export function liveTimeTotals(
  entries: readonly TimeLogEntry[],
  sessionId: string,
  project: string,
  observedAtMs: number,
  dayStartAtMs: number,
  openHumanInterval?: LiveInterval,
  openAgentInterval?: LiveInterval,
): LiveTimeTotals | undefined {
  if (
    sessionId.trim() === "" ||
    project.trim() === "" ||
    !Number.isFinite(observedAtMs) ||
    !Number.isFinite(dayStartAtMs) ||
    dayStartAtMs > observedAtMs
  ) {
    return undefined;
  }

  const humanIntervals: LiveInterval[] = [];
  const agentIntervals: LiveInterval[] = [];
  const todayHumanIntervals: LiveInterval[] = [];
  const todayAgentIntervals: LiveInterval[] = [];

  for (const entry of entries) {
    if (entry.sessionId !== sessionId || entry.project !== project) continue;

    const intervals = intervalsForSource(
      entry.sourceKind,
      humanIntervals,
      agentIntervals,
    );
    const todayIntervals = intervalsForSource(
      entry.sourceKind,
      todayHumanIntervals,
      todayAgentIntervals,
    );
    if (intervals === undefined || todayIntervals === undefined) continue;

    addLiveInterval(
      intervals,
      todayIntervals,
      entry.startAtMs,
      entry.endAtMs,
      observedAtMs,
      dayStartAtMs,
    );
  }

  if (openHumanInterval !== undefined) {
    addLiveInterval(
      humanIntervals,
      todayHumanIntervals,
      openHumanInterval.startAtMs,
      openHumanInterval.endAtMs,
      observedAtMs,
      dayStartAtMs,
    );
  }

  if (openAgentInterval !== undefined) {
    addLiveInterval(
      agentIntervals,
      todayAgentIntervals,
      openAgentInterval.startAtMs,
      openAgentInterval.endAtMs,
      observedAtMs,
      dayStartAtMs,
    );
  }

  const humanMilliseconds = unionMilliseconds(humanIntervals);
  const agentMilliseconds = unionMilliseconds(agentIntervals);
  const todayHumanMilliseconds = unionMilliseconds(todayHumanIntervals);
  const todayAgentMilliseconds = unionMilliseconds(todayAgentIntervals);
  if (
    !Number.isFinite(humanMilliseconds) ||
    !Number.isFinite(agentMilliseconds) ||
    !Number.isFinite(todayHumanMilliseconds) ||
    !Number.isFinite(todayAgentMilliseconds)
  ) {
    return undefined;
  }

  return {
    humanMilliseconds,
    agentMilliseconds,
    todayHumanMilliseconds,
    todayAgentMilliseconds,
  };
}

function addLiveInterval(
  intervals: LiveInterval[],
  todayIntervals: LiveInterval[],
  startAtMs: number,
  endAtMs: number,
  observedAtMs: number,
  dayStartAtMs: number,
): void {
  addObservedInterval(intervals, startAtMs, endAtMs, observedAtMs);
  addObservedInterval(
    todayIntervals,
    Math.max(startAtMs, dayStartAtMs),
    endAtMs,
    observedAtMs,
  );
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
