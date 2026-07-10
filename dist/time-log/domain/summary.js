export function exportTimeEntries(entries) {
    return JSON.stringify({
        entries,
        summaries: {
            5: summarizeTimeEntries(entries, 5),
            10: summarizeTimeEntries(entries, 10),
            15: summarizeTimeEntries(entries, 15),
        },
    });
}
export function summarizeTimeEntries(entries, compactionMinutes) {
    const bucketMilliseconds = compactionMilliseconds(compactionMinutes);
    const allocationMilliseconds = entries.reduce((total, entry) => total + entry.endAtMs - entry.startAtMs, 0);
    const wallClockMilliseconds = unionMilliseconds(entries);
    const rowsByKey = new Map();
    for (const entry of entries) {
        let segmentStartAtMs = entry.startAtMs;
        while (segmentStartAtMs < entry.endAtMs) {
            const bucketStartAtMs = Math.floor(segmentStartAtMs / bucketMilliseconds) * bucketMilliseconds;
            const segmentEndAtMs = Math.min(entry.endAtMs, bucketStartAtMs + bucketMilliseconds);
            const segmentAllocationMilliseconds = segmentEndAtMs - segmentStartAtMs;
            const date = new Date(bucketStartAtMs).toISOString().slice(0, 10);
            const key = `${bucketStartAtMs}:${entry.repositoryId}`;
            const existingRow = rowsByKey.get(key);
            if (existingRow === undefined) {
                rowsByKey.set(key, {
                    bucketStartAtMs,
                    date,
                    project: entry.project,
                    repositoryId: entry.repositoryId,
                    allocationMilliseconds: segmentAllocationMilliseconds,
                });
            }
            else {
                existingRow.allocationMilliseconds += segmentAllocationMilliseconds;
            }
            segmentStartAtMs = segmentEndAtMs;
        }
    }
    const rows = [...rowsByKey.values()].sort(compareRows);
    return { allocationMilliseconds, wallClockMilliseconds, rows };
}
function compactionMilliseconds(compactionMinutes) {
    if (compactionMinutes !== 5 && compactionMinutes !== 10 && compactionMinutes !== 15) {
        throw new Error("Time log compaction must be 5, 10, or 15 minutes.");
    }
    return compactionMinutes * 60 * 1_000;
}
function unionMilliseconds(entries) {
    const intervals = [...entries].sort((left, right) => left.startAtMs - right.startAtMs);
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
function compareRows(left, right) {
    if (left.bucketStartAtMs !== right.bucketStartAtMs) {
        return left.bucketStartAtMs - right.bucketStartAtMs;
    }
    return left.repositoryId.localeCompare(right.repositoryId);
}
