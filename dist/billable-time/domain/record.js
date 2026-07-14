import Big from "../../vendor/big.js";
import { isFiniteNumber } from "../../utils/is-finite-number.js";
import { parseDecimalString } from "../../utils/parse-decimal-string.js";
import { parseNonEmptyString } from "../../utils/parse-non-empty-string.js";

export function parseAttentionTokenRecord(value) {
  if (!isRecord(value)) return undefined;
  const emittedAtMs = value.emittedAtMs;
  const sessionId = parseNonEmptyString(value.sessionId);
  const clientId = parseNonEmptyString(value.clientId);
  const clientLabel = parseNonEmptyString(value.clientLabel);
  const repository = parseNonEmptyString(value.repository);
  const sourceKind = value.sourceKind;
  const durationMs = value.durationMs;
  const ratePerHour = parseRate(value.ratePerHour);
  const currency = parseCurrency(value.currency);
  if (
    !isFiniteNumber(emittedAtMs) ||
    sessionId === undefined ||
    clientId === undefined ||
    clientLabel === undefined ||
    repository === undefined ||
    sourceKind !== "attention" ||
    durationMs !== 300_000 ||
    ratePerHour === undefined ||
    currency === undefined
  ) {
    return undefined;
  }
  return {
    emittedAtMs,
    sessionId,
    clientId,
    clientLabel,
    repository,
    sourceKind,
    durationMs,
    ratePerHour,
    currency,
  };
}

export function parseAiIntervalRecord(value) {
  if (!isRecord(value)) return undefined;
  const startedAtMs = value.startedAtMs;
  const endedAtMs = value.endedAtMs;
  const sessionId = parseNonEmptyString(value.sessionId);
  const clientId = parseNonEmptyString(value.clientId);
  const clientLabel = parseNonEmptyString(value.clientLabel);
  const repository = parseNonEmptyString(value.repository);
  const sourceKind = value.sourceKind;
  const durationMs = value.durationMs;
  const terminalReason = value.terminalReason;
  const ratePerHour = parseRate(value.ratePerHour);
  const currency = parseCurrency(value.currency);
  if (
    !isFiniteNumber(startedAtMs) ||
    !isFiniteNumber(endedAtMs) ||
    startedAtMs > endedAtMs ||
    sessionId === undefined ||
    clientId === undefined ||
    clientLabel === undefined ||
    repository === undefined ||
    sourceKind !== "ai" ||
    !isFiniteNumber(durationMs) ||
    durationMs !== endedAtMs - startedAtMs ||
    (terminalReason !== "turn_end" &&
      terminalReason !== "shutdown" &&
      terminalReason !== "superseded") ||
    ratePerHour === undefined ||
    currency === undefined
  ) {
    return undefined;
  }
  return {
    startedAtMs,
    endedAtMs,
    sessionId,
    clientId,
    clientLabel,
    repository,
    sourceKind,
    durationMs,
    terminalReason,
    ratePerHour,
    currency,
  };
}

function parseRate(value) {
  const rate = parseDecimalString(value);
  return rate !== undefined && Big(rate).gt(0) ? rate : undefined;
}

function parseCurrency(value) {
  const currency = parseNonEmptyString(value)?.toUpperCase();
  return currency !== undefined && /^[A-Z]{3}$/.test(currency)
    ? currency
    : undefined;
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
