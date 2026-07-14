export function createBillableWorkEntries(records, descriptions) {
  const descriptionsBySession = latestDescriptionsBySession(descriptions);
  return records.map((record) =>
    createBillableWorkEntry(
      record,
      descriptionsBySession.get(record.sessionId)?.description ??
        "Unlabeled billable work",
    ),
  );
}

function createBillableWorkEntry(record, description) {
  const attributes = {
    clientId: record.clientId,
    clientLabel: record.clientLabel,
    projectId: record.projectId ?? record.repository,
    projectName: record.projectName ?? record.repository,
    description,
    durationMs: record.durationMs,
    ratePerHour: record.ratePerHour,
    currency: record.currency,
  };
  if (record.sourceKind === "attention") {
    return {
      ...attributes,
      sourceKind: record.sourceKind,
      emittedAtMs: record.emittedAtMs,
    };
  }
  return {
    ...attributes,
    sourceKind: record.sourceKind,
    startedAtMs: record.startedAtMs,
    endedAtMs: record.endedAtMs,
  };
}

function latestDescriptionsBySession(descriptions) {
  const latest = new Map();
  for (const description of descriptions) {
    const existing = latest.get(description.sessionId);
    if (
      existing === undefined ||
      existing.recordedAtMs <= description.recordedAtMs
    ) {
      latest.set(description.sessionId, description);
    }
  }
  return latest;
}
