import type { BillableDescription } from "@/billable-time/domain/description.js"
import type { BillableRecord } from "@/billable-time/domain/record.js"

type WorkEntryAttributes = {
  clientId: string
  clientLabel: string
  projectId: string
  projectName: string
  description: string
  durationMs: number
  ratePerHour: string
  currency: string
}

export type BillableWorkEntry = (
  | WorkEntryAttributes & {
    sourceKind: "attention"
    emittedAtMs: number
  }
  | WorkEntryAttributes & {
    sourceKind: "ai"
    startedAtMs: number
    endedAtMs: number
  }
)

export function createBillableWorkEntries(
  records: readonly BillableRecord[],
  descriptions: readonly BillableDescription[],
): BillableWorkEntry[] {
  const descriptionsBySession = latestDescriptionsBySession(descriptions)

  return records.map((record) => createBillableWorkEntry(
    record,
    descriptionsBySession.get(record.sessionId)?.description ?? "Unlabeled billable work",
  ))
}

function createBillableWorkEntry(record: BillableRecord, description: string): BillableWorkEntry {
  const attributes: WorkEntryAttributes = {
    clientId: record.clientId,
    clientLabel: record.clientLabel,
    projectId: record.projectId ?? record.repository,
    projectName: record.projectName ?? record.repository,
    description,
    durationMs: record.durationMs,
    ratePerHour: record.ratePerHour,
    currency: record.currency,
  }

  if (record.sourceKind === "attention") {
    return { ...attributes, sourceKind: record.sourceKind, emittedAtMs: record.emittedAtMs }
  }

  return {
    ...attributes,
    sourceKind: record.sourceKind,
    startedAtMs: record.startedAtMs,
    endedAtMs: record.endedAtMs,
  }
}

function latestDescriptionsBySession(
  descriptions: readonly BillableDescription[],
): ReadonlyMap<string, BillableDescription> {
  const latest = new Map<string, BillableDescription>()

  for (const description of descriptions) {
    const existing = latest.get(description.sessionId)
    if (existing === undefined || existing.recordedAtMs <= description.recordedAtMs) {
      latest.set(description.sessionId, description)
    }
  }

  return latest
}
