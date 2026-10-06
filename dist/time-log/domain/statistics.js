export function summarizeTimeLogEntries(entries) {
  const overall = emptyStatisticsAccumulator();
  const projectStatistics = new Map();
  for (const entry of entries) {
    addEntryToStatistics(overall, entry);
    const project =
      projectStatistics.get(entry.project) ?? emptyStatisticsAccumulator();
    addEntryToStatistics(project, entry);
    projectStatistics.set(entry.project, project);
  }
  return {
    entryCount: overall.entryCount,
    sources: {
      humanActive: { ...overall.humanActive },
      agentTurnElapsed: { ...overall.agentTurnElapsed },
    },
    firstStartAtMs: overall.firstStartAtMs,
    lastEndAtMs: overall.lastEndAtMs,
    projects: [...projectStatistics]
      .map(([project, statistics]) => ({
        project,
        entryCount: statistics.entryCount,
        sources: {
          humanActive: { ...statistics.humanActive },
          agentTurnElapsed: { ...statistics.agentTurnElapsed },
        },
        firstStartAtMs: statistics.firstStartAtMs,
        lastEndAtMs: statistics.lastEndAtMs,
      }))
      .sort((left, right) => left.project.localeCompare(right.project)),
  };
}

function emptyStatisticsAccumulator() {
  return {
    entryCount: 0,
    humanActive: { entryCount: 0, observedMilliseconds: 0 },
    agentTurnElapsed: { entryCount: 0, observedMilliseconds: 0 },
    firstStartAtMs: null,
    lastEndAtMs: null,
  };
}

function addEntryToStatistics(statistics, entry) {
  const durationMs = entry.endAtMs - entry.startAtMs;
  const source =
    entry.sourceKind === "human_active"
      ? statistics.humanActive
      : statistics.agentTurnElapsed;
  statistics.entryCount += 1;
  source.entryCount += 1;
  source.observedMilliseconds += durationMs;
  statistics.firstStartAtMs =
    statistics.firstStartAtMs === null
      ? entry.startAtMs
      : Math.min(statistics.firstStartAtMs, entry.startAtMs);
  statistics.lastEndAtMs =
    statistics.lastEndAtMs === null
      ? entry.endAtMs
      : Math.max(statistics.lastEndAtMs, entry.endAtMs);
}
