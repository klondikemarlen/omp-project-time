import Big from "../vendor/big.js";
import { parseDecimalString } from "../utils/parse-decimal-string.js";
import { parseNonEmptyString } from "../utils/parse-non-empty-string.js";

export function parseBillableTimeConfig(value) {
  const parsedValue = parseBillableTimeJson(value);
  if (parsedValue === undefined || Object.keys(parsedValue).length === 0) {
    return { clientsByRepository: new Map() };
  }
  if (!isRecord(parsedValue.clients) || !isRecord(parsedValue.repositories)) {
    throw new Error(
      "Billable time config requires clients and repositories objects.",
    );
  }
  const clients = new Map();
  for (const [id, rawClient] of Object.entries(parsedValue.clients)) {
    const client = parseClient(id, rawClient);
    if (client === undefined)
      throw new Error(`Invalid billable client: ${id}.`);
    clients.set(id, client);
  }
  const clientsByRepository = new Map();
  for (const [repository, rawClientId] of Object.entries(
    parsedValue.repositories,
  )) {
    const normalizedRepository = normalizeRepository(repository);
    const clientId = parseNonEmptyString(rawClientId);
    const client = clientId === undefined ? undefined : clients.get(clientId);
    if (normalizedRepository === undefined || client === undefined) {
      throw new Error(`Invalid billable repository mapping: ${repository}.`);
    }
    clientsByRepository.set(normalizedRepository, client);
  }
  return { clientsByRepository };
}

function parseBillableTimeJson(value) {
  if (value === undefined) return undefined;
  if (typeof value !== "string") return isRecord(value) ? value : undefined;
  try {
    const parsedValue = JSON.parse(value);
    if (!isRecord(parsedValue))
      throw new Error("Billable time config must be a JSON object.");
    return parsedValue;
  } catch (error) {
    const detail = error instanceof Error ? error.message : "invalid JSON";
    throw new Error(`Invalid billable time config: ${detail}`);
  }
}

function parseClient(id, value) {
  if (!isRecord(value)) return undefined;
  const label = parseNonEmptyString(value.label);
  const currency = parseNonEmptyString(value.currency)?.toUpperCase();
  const attentionRatePerHour = parseDecimalString(value.attentionRatePerHour);
  const aiRatePerHour = parseDecimalString(value.aiRatePerHour);
  const validCurrency = currency !== undefined && /^[A-Z]{3}$/.test(currency);
  const validAttentionRate =
    attentionRatePerHour !== undefined && Big(attentionRatePerHour).gt(0);
  const validAiRate = aiRatePerHour !== undefined && Big(aiRatePerHour).gt(0);
  if (
    label === undefined ||
    !validCurrency ||
    !validAttentionRate ||
    !validAiRate
  )
    return undefined;
  return { id, label, currency, attentionRatePerHour, aiRatePerHour };
}

function normalizeRepository(value) {
  const repository = parseNonEmptyString(value);
  return repository?.replace(/\.git$/i, "").toLowerCase();
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export default parseBillableTimeConfig;
