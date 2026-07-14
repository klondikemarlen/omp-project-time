import { positiveRateSchema, type PositiveRate } from "@/billable-time/domain/rate.js"
import { currencySchema } from "@/billable-time/domain/currency.js"
import { z } from "@/vendor/zod.js"

const commonSchema = z.object({
  sessionId: z.string().min(1),
  clientId: z.string().min(1),
  clientLabel: z.string().min(1),
  repository: z.string().min(1),
  projectId: z.string().min(1).optional(),
  projectName: z.string().min(1).optional(),
  ratePerHour: positiveRateSchema,
  currency: currencySchema,
})
const attentionTokenSchema = commonSchema.extend({
  emittedAtMs: z.number().finite(),
  sourceKind: z.literal("attention"),
  durationMs: z.literal(300_000),
})
const aiIntervalSchema = commonSchema.extend({
  startedAtMs: z.number().finite(),
  endedAtMs: z.number().finite(),
  sourceKind: z.literal("ai"),
  durationMs: z.number().finite().nonnegative(),
  terminalReason: z.enum(["turn_end", "shutdown", "superseded"]),
}).refine((record) => record.durationMs === record.endedAtMs - record.startedAtMs, "duration must match timestamps")

export type AttentionTokenRecord = z.infer<typeof attentionTokenSchema>
export type AiIntervalRecord = z.infer<typeof aiIntervalSchema>
export type BillableRecord = AttentionTokenRecord | AiIntervalRecord

export type BillableAttribution = Pick<
  AttentionTokenRecord,
  "sessionId" | "clientId" | "clientLabel" | "repository" | "projectId" | "projectName" | "currency"
>
export type PendingAiInterval = Omit<AiIntervalRecord, "endedAtMs" | "durationMs" | "terminalReason">

export function createAttentionToken(
  attribution: BillableAttribution,
  emittedAtMs: number,
  ratePerHour: PositiveRate,
): AttentionTokenRecord {
  return attentionTokenSchema.parse({
    ...attribution,
    emittedAtMs,
    sourceKind: "attention",
    durationMs: 300_000,
    ratePerHour,
  })
}

export function startAiInterval(
  attribution: BillableAttribution,
  startedAtMs: number,
  ratePerHour: PositiveRate,
): PendingAiInterval {
  return {
    ...attribution,
    startedAtMs,
    sourceKind: "ai",
    ratePerHour,
  }
}

export function parseAttentionTokenRecord(value: unknown): AttentionTokenRecord | undefined {
  return attentionTokenSchema.safeParse(value).data
}

export function parseAiIntervalRecord(value: unknown): AiIntervalRecord | undefined {
  return aiIntervalSchema.safeParse(value).data
}

export function closeAiInterval(
  pending: PendingAiInterval,
  endedAtMs: number,
  terminalReason: AiIntervalRecord["terminalReason"],
): AiIntervalRecord {
  const settledAtMs = Math.max(endedAtMs, pending.startedAtMs)

  return aiIntervalSchema.parse({
    ...pending,
    endedAtMs: settledAtMs,
    durationMs: settledAtMs - pending.startedAtMs,
    terminalReason,
  })
}
