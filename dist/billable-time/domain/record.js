import { positiveRateSchema } from "../../billable-time/domain/rate.js";
import { currencySchema } from "../../billable-time/domain/currency.js";
import { z } from "../../vendor/zod.js";

const commonSchema = z.object({
  sessionId: z.string().min(1),
  clientId: z.string().min(1),
  clientLabel: z.string().min(1),
  repository: z.string().min(1),
  projectId: z.string().min(1).optional(),
  projectName: z.string().min(1).optional(),
  ratePerHour: positiveRateSchema,
  currency: currencySchema,
});
const attentionTokenSchema = commonSchema.extend({
  emittedAtMs: z.number().finite(),
  sourceKind: z.literal("attention"),
  durationMs: z.literal(300_000),
});
const aiIntervalSchema = commonSchema
  .extend({
    startedAtMs: z.number().finite(),
    endedAtMs: z.number().finite(),
    sourceKind: z.literal("ai"),
    durationMs: z.number().finite().nonnegative(),
    terminalReason: z.enum(["turn_end", "shutdown", "superseded"]),
  })
  .refine(
    (record) => record.durationMs === record.endedAtMs - record.startedAtMs,
    "duration must match timestamps",
  );
export function createAttentionToken(attribution, emittedAtMs, ratePerHour) {
  return attentionTokenSchema.parse({
    ...attribution,
    emittedAtMs,
    sourceKind: "attention",
    durationMs: 300_000,
    ratePerHour,
  });
}

export function startAiInterval(attribution, startedAtMs, ratePerHour) {
  return {
    ...attribution,
    startedAtMs,
    sourceKind: "ai",
    ratePerHour,
  };
}

export function parseAttentionTokenRecord(value) {
  return attentionTokenSchema.safeParse(value).data;
}

export function parseAiIntervalRecord(value) {
  return aiIntervalSchema.safeParse(value).data;
}

export function closeAiInterval(pending, endedAtMs, terminalReason) {
  const settledAtMs = Math.max(endedAtMs, pending.startedAtMs);
  return aiIntervalSchema.parse({
    ...pending,
    endedAtMs: settledAtMs,
    durationMs: settledAtMs - pending.startedAtMs,
    terminalReason,
  });
}
