import Big from "../vendor/big.js";

export function summarizeBillableRecords(records) {
  const summaries = new Map();
  for (const record of records) {
    const key = [
      record.clientId,
      record.currency,
      record.ratePerHour,
      record.sourceKind,
    ].join("\u0000");
    const existing = summaries.get(key);
    if (existing === undefined) {
      summaries.set(key, {
        clientId: record.clientId,
        clientLabel: record.clientLabel,
        currency: record.currency,
        ratePerHour: record.ratePerHour,
        sourceKind: record.sourceKind,
        count: 1,
        durationMs: record.durationMs,
        amount: amountFor(record.ratePerHour, record.durationMs),
      });
      continue;
    }
    const durationMs = existing.durationMs + record.durationMs;
    summaries.set(key, {
      ...existing,
      count: existing.count + 1,
      durationMs,
      amount: amountFor(existing.ratePerHour, durationMs),
    });
  }
  return [...summaries.values()];
}

function amountFor(ratePerHour, durationMs) {
  return Big(ratePerHour)
    .times(durationMs)
    .div(60 * 60 * 1000)
    .toString();
}

export default summarizeBillableRecords;
