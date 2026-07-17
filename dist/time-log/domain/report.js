export function buildReport(entries, sourceKind, mode, weights) {
  const filtered = entries.filter((entry) => entry.sourceKind === sourceKind);
  if (mode === "raw") {
    return {
      sourceKind,
      mode,
      ompActiveUnionMs: unionMilliseconds(filtered),
      entries: fullAttributionEntries(filtered, sourceKind, mode),
    };
  }
  return splitWeightedReport(filtered, sourceKind, mode, weights);
}

function fullAttributionEntries(entries, sourceKind, mode) {
  const totals = new Map();
  for (const entry of entries) {
    const attribution = attributionFor(entry);
    const key = entryKey(entry, attribution);
    const durationMs = entry.endAtMs - entry.startAtMs;
    const existing = totals.get(key);
    if (existing === undefined) {
      totals.set(key, {
        mode,
        sourceKind,
        repositoryId: entry.repositoryId,
        ...attribution,
        durationMs,
      });
    } else {
      existing.durationMs += durationMs;
    }
  }
  return [...totals.values()];
}

function splitWeightedReport(entries, sourceKind, mode, weights) {
  if (
    mode === "weighted" &&
    Object.values(weights ?? {}).some(
      (weight) => !Number.isFinite(weight) || weight <= 0,
    )
  ) {
    throw new Error("Report weights must be positive finite numbers.");
  }
  const segments = segmentEntries(entries);
  const splitTotals = new Map();
  const weightedTotals = new Map();
  let ompActiveUnionMs = 0;
  for (const segment of segments) {
    const duration = segment.endAtMs - segment.startAtMs;
    if (duration <= 0) continue;
    ompActiveUnionMs += duration;
    const active = segment.entries;
    if (active.length === 0) continue;
    const equalShare = duration / active.length;
    const weightSum = active.reduce(
      (sum, entry) => sum + (weights?.[entry.repositoryId] ?? 1),
      0,
    );
    for (const entry of active) {
      const attribution = attributionFor(entry);
      const key = entryKey(entry, attribution);
      const weight = weights?.[entry.repositoryId] ?? 1;
      const weightedShare =
        weightSum > 0 ? (duration * weight) / weightSum : equalShare;
      addDuration(splitTotals, key, {
        mode: "split",
        sourceKind,
        repositoryId: entry.repositoryId,
        ...attribution,
        durationMs: equalShare,
      });
      addDuration(weightedTotals, key, {
        mode: "weighted",
        sourceKind,
        repositoryId: entry.repositoryId,
        ...attribution,
        durationMs: weightedShare,
      });
    }
  }
  const totals = mode === "split" ? splitTotals : weightedTotals;
  return {
    sourceKind,
    mode,
    ompActiveUnionMs,
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

function unionMilliseconds(entries) {
  const intervals = [...entries].sort(
    (left, right) => left.startAtMs - right.startAtMs,
  );
  let totalMilliseconds = 0;
  let currentStartAtMs;
  let currentEndAtMs;
  for (const entry of intervals) {
    if (currentStartAtMs === undefined || currentEndAtMs === undefined) {
      currentStartAtMs = entry.startAtMs;
      currentEndAtMs = entry.endAtMs;
      continue;
    }
    if (entry.startAtMs > currentEndAtMs) {
      totalMilliseconds += currentEndAtMs - currentStartAtMs;
      currentStartAtMs = entry.startAtMs;
      currentEndAtMs = entry.endAtMs;
      continue;
    }
    currentEndAtMs = Math.max(currentEndAtMs, entry.endAtMs);
  }
  if (currentStartAtMs !== undefined && currentEndAtMs !== undefined) {
    totalMilliseconds += currentEndAtMs - currentStartAtMs;
  }
  return totalMilliseconds;
}

function attributionFor(entry) {
  return (
    entry.attribution ?? {
      projectId: entry.repositoryId,
      projectName: entry.project,
      categoryId: "default",
      categoryLabel: "Default",
      task: "Unlabeled project work",
    }
  );
}

function entryKey(entry, attribution) {
  return [
    entry.repositoryId,
    attribution.projectId,
    attribution.categoryId,
    attribution.task ?? "",
  ].join("\0");
}

function addDuration(totals, key, template) {
  const existing = totals.get(key);
  if (existing === undefined) {
    totals.set(key, { ...template });
  } else {
    existing.durationMs += template.durationMs;
  }
}
