const dateFormatters = new Map();
export function buildManualTrackedDailyReport(entries, project) {
  const totals = new Map();
  for (const entry of entries) {
    if (
      entry.sourceKind !== "manual_tracked" ||
      entry.timeZone === undefined ||
      (project !== undefined && entry.project !== project)
    )
      continue;
    let segmentStartAtMs = entry.startAtMs;
    while (segmentStartAtMs < entry.endAtMs) {
      const localDate = localDateAt(segmentStartAtMs, entry.timeZone);
      const segmentEndAtMs =
        localDateAt(entry.endAtMs - 1, entry.timeZone) === localDate
          ? entry.endAtMs
          : nextLocalDateChange(
              segmentStartAtMs,
              entry.endAtMs,
              entry.timeZone,
              localDate,
            );
      const key = `${localDate}\u0000${entry.project}\u0000${entry.repositoryId}`;
      const existing = totals.get(key);
      const durationMs = segmentEndAtMs - segmentStartAtMs;
      if (existing === undefined) {
        totals.set(key, {
          sourceKind: "manual_tracked",
          localDate,
          project: entry.project,
          repositoryId: entry.repositoryId,
          durationMs,
        });
      } else {
        existing.durationMs += durationMs;
      }
      segmentStartAtMs = segmentEndAtMs;
    }
  }
  return [...totals.values()].sort(
    (left, right) =>
      left.localDate.localeCompare(right.localDate) ||
      left.project.localeCompare(right.project) ||
      left.repositoryId.localeCompare(right.repositoryId),
  );
}

function localDateAt(timestampMs, timeZone) {
  let formatter = dateFormatters.get(timeZone);
  if (formatter === undefined) {
    formatter = new Intl.DateTimeFormat("en-US", {
      calendar: "iso8601",
      day: "2-digit",
      month: "2-digit",
      timeZone,
      year: "numeric",
    });
    dateFormatters.set(timeZone, formatter);
  }
  const parts = formatter.formatToParts(new Date(timestampMs));
  const values = Object.fromEntries(
    parts.map(({ type, value }) => [type, value]),
  );
  return `${values.year}-${values.month}-${values.day}`;
}

function nextLocalDateChange(startAtMs, endAtMs, timeZone, localDate) {
  let beforeChange = startAtMs;
  let afterChange = endAtMs;
  while (afterChange - beforeChange > 1) {
    const midpoint = Math.floor((beforeChange + afterChange) / 2);
    if (localDateAt(midpoint, timeZone) === localDate) beforeChange = midpoint;
    else afterChange = midpoint;
  }
  return afterChange;
}
