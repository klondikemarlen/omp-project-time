import Big from "../vendor/big.js";

export function formatBillableAmount(amount, currency) {
  const fractionDigits = new Intl.NumberFormat("en", {
    style: "currency",
    currency,
  }).resolvedOptions().maximumFractionDigits;
  return Big(amount).toFixed(fractionDigits);
}

export function billableSummaryText(summaries) {
  if (summaries.length === 0) return "No billable time recorded.";
  return summaries
    .map((summary) => {
      const amount = formatBillableAmount(summary.amount, summary.currency);
      return `${summary.clientLabel}: ${summary.sourceKind} ${summary.count} units, ${summary.durationMs}ms @ ${summary.ratePerHour} ${summary.currency}/h = ${amount} ${summary.currency}`;
    })
    .join("\n");
}

export function billableWorkEntryPreview(entries) {
  return JSON.stringify(entries.map(workEntryPreview), null, 2);
}

function workEntryPreview(entry) {
  const shared = {
    client_id: entry.clientId,
    client_label: entry.clientLabel,
    project_id: entry.projectId,
    project_name: entry.projectName,
    source_kind: entry.sourceKind,
    duration_ms: entry.durationMs,
    rate_per_hour: entry.ratePerHour,
    currency: entry.currency,
    description: entry.description,
  };
  if (entry.sourceKind === "attention") {
    return { ...shared, emitted_at_ms: entry.emittedAtMs };
  }
  return {
    ...shared,
    started_at_ms: entry.startedAtMs,
    ended_at_ms: entry.endedAtMs,
  };
}
