export function buildHumanActiveCoverage(entries, project, range) {
  const entriesByProject = new Map();
  for (const entry of entries) {
    if (
      entry.sourceKind !== "human_active" ||
      (project !== undefined && entry.project !== project)
    )
      continue;
    const startAtMs =
      range === undefined
        ? entry.startAtMs
        : Math.max(entry.startAtMs, range.startAtMs);
    const endAtMs =
      range === undefined
        ? entry.endAtMs
        : Math.min(entry.endAtMs, range.endAtMs);
    if (endAtMs <= startAtMs) continue;
    const projectEntries = entriesByProject.get(entry.project) ?? [];
    projectEntries.push(
      range === undefined ? entry : { ...entry, startAtMs, endAtMs },
    );
    entriesByProject.set(entry.project, projectEntries);
  }
  return [...entriesByProject.entries()]
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([project, projectEntries]) => {
      const intervals = mergedIntervals(projectEntries);
      const inactiveGaps = intervals.slice(1).map((interval, index) => ({
        startAtMs: intervals[index].endAtMs,
        endAtMs: interval.startAtMs,
      }));
      const unionTotalMs = intervals.reduce(
        (total, interval) => total + interval.endAtMs - interval.startAtMs,
        0,
      );
      const rawTotalMs = projectEntries.reduce(
        (total, entry) => total + entry.endAtMs - entry.startAtMs,
        0,
      );
      return {
        sourceKind: "human_active",
        project,
        rawTotalMs,
        unionTotalMs,
        concurrentOverlapMs: rawTotalMs - unionTotalMs,
        span:
          intervals.length === 0
            ? null
            : {
                startAtMs: intervals[0].startAtMs,
                endAtMs: intervals.at(-1).endAtMs,
              },
        inactiveGaps: {
          totalMs: inactiveGaps.reduce(
            (total, interval) => total + interval.endAtMs - interval.startAtMs,
            0,
          ),
          intervals: inactiveGaps,
        },
      };
    });
}

export function buildReport(entries, sourceKind, mode, weights, project) {
  const sourceEntries = entries.filter(
    (entry) => entry.sourceKind === sourceKind,
  );
  const scopedEntries =
    project === undefined
      ? sourceEntries
      : sourceEntries.filter((entry) => entry.project === project);
  if (mode === "raw") {
    return {
      sourceKind,
      mode,
      ompActiveUnionMs: unionMilliseconds(scopedEntries),
      entries: repositoryEntries(scopedEntries, sourceKind, mode),
    };
  }
  return splitWeightedReport(sourceEntries, sourceKind, mode, weights, project);
}

function repositoryEntries(entries, sourceKind, mode) {
  const totals = new Map();
  for (const entry of entries) {
    const key = entry.repositoryId;
    const durationMs = entry.endAtMs - entry.startAtMs;
    const existing = totals.get(key);
    if (existing === undefined) {
      totals.set(key, {
        mode,
        sourceKind,
        repositoryId: entry.repositoryId,
        project: entry.project,
        durationMs,
      });
    } else {
      existing.durationMs += durationMs;
    }
  }
  return [...totals.values()];
}

function splitWeightedReport(entries, sourceKind, mode, weights, project) {
  if (
    mode === "weighted" &&
    Object.values(weights ?? {}).some(
      (weight) => !Number.isFinite(weight) || weight <= 0,
    )
  ) {
    throw new Error("Report weights must be positive finite numbers.");
  }
  const scopedEntries =
    project === undefined
      ? entries
      : entries.filter((entry) => entry.project === project);
  const segments = segmentEntries(entries);
  const splitTotals = new Map();
  const weightedTotals = new Map();
  for (const segment of segments) {
    const duration = segment.endAtMs - segment.startAtMs;
    if (duration <= 0) continue;
    const active = segment.entries;
    if (active.length === 0) continue;
    const equalShare = duration / active.length;
    const weightSum = active.reduce(
      (sum, entry) => sum + (weights?.[entry.repositoryId] ?? 1),
      0,
    );
    for (const entry of active) {
      if (project !== undefined && entry.project !== project) continue;
      const key = entry.repositoryId;
      const weight = weights?.[entry.repositoryId] ?? 1;
      const weightedShare =
        weightSum > 0 ? (duration * weight) / weightSum : equalShare;
      addDuration(splitTotals, key, {
        mode: "split",
        sourceKind,
        repositoryId: entry.repositoryId,
        project: entry.project,
        durationMs: equalShare,
      });
      addDuration(weightedTotals, key, {
        mode: "weighted",
        sourceKind,
        repositoryId: entry.repositoryId,
        project: entry.project,
        durationMs: weightedShare,
      });
    }
  }
  const totals = mode === "split" ? splitTotals : weightedTotals;
  return {
    sourceKind,
    mode,
    ompActiveUnionMs: unionMilliseconds(scopedEntries),
    entries: [...totals.values()],
  };
}

function segmentEntries(entries) {
  const events = [];
  for (const entry of entries) {
    events.push({ at: entry.startAtMs, entry, isStart: true });
    events.push({ at: entry.endAtMs, entry, isStart: false });
  }
  events.sort((left, right) => {
    if (left.at !== right.at) return left.at - right.at;
    return left.isStart ? 1 : -1;
  });
  const active = new Set();
  let segmentStart;
  const segments = [];
  for (const event of events) {
    if (segmentStart !== undefined && event.at > segmentStart) {
      segments.push({
        startAtMs: segmentStart,
        endAtMs: event.at,
        entries: [...active],
      });
    }
    if (event.isStart) active.add(event.entry);
    else active.delete(event.entry);
    if (active.size > 0) segmentStart = event.at;
    else segmentStart = undefined;
  }
  return segments;
}

function mergedIntervals(entries) {
  const intervals = [...entries]
    .sort((left, right) => left.startAtMs - right.startAtMs)
    .map(({ startAtMs, endAtMs }) => ({ startAtMs, endAtMs }));
  const merged = [];
  for (const interval of intervals) {
    const previous = merged.at(-1);
    if (previous === undefined || interval.startAtMs > previous.endAtMs) {
      merged.push(interval);
    } else {
      previous.endAtMs = Math.max(previous.endAtMs, interval.endAtMs);
    }
  }
  return merged;
}

function unionMilliseconds(entries) {
  return mergedIntervals(entries).reduce(
    (total, interval) => total + interval.endAtMs - interval.startAtMs,
    0,
  );
}

function addDuration(totals, key, template) {
  const existing = totals.get(key);
  if (existing === undefined) {
    totals.set(key, { ...template });
  } else {
    existing.durationMs += template.durationMs;
  }
}
