import { positiveRateSchema } from "../billable-time/domain/rate.js";
import { currencyInputSchema } from "../billable-time/domain/currency.js";
import { normalizeBillableRepository } from "../billable-time/domain/repository.js";
import { z } from "../vendor/zod.js";

const clientSchema = z.object({
  label: z.string().trim().min(1),
  currency: currencyInputSchema,
  attentionRatePerHour: positiveRateSchema,
  aiRatePerHour: positiveRateSchema,
});
const projectNameSchema = z.string().trim().min(1);
const settingsSchema = z.object({
  clients: z.record(z.string(), clientSchema),
  defaultClient: z.string().trim().min(1).optional(),
  projects: z.record(z.string(), projectNameSchema).optional(),
  repositories: z.record(z.string(), z.string().trim().min(1)).optional(),
});
export function parseBillableTimeConfig(value) {
  const settings = parseSettings(value);
  if (settings === undefined) {
    return {
      clientsByRepository: new Map(),
      projectNamesByRepository: new Map(),
    };
  }
  const clients = new Map();
  for (const [id, client] of Object.entries(settings.clients)) {
    clients.set(id, { id, ...client });
  }
  const clientsByRepository = new Map();
  for (const [repository, clientId] of Object.entries(
    settings.repositories ?? {},
  )) {
    clientsByRepository.set(
      normalizeBillableRepository(repository),
      clientFor(clientId, clients),
    );
  }
  const projectNamesByRepository = new Map();
  for (const [repository, projectName] of Object.entries(
    settings.projects ?? {},
  )) {
    projectNamesByRepository.set(
      normalizeBillableRepository(repository),
      projectName,
    );
  }
  return {
    clientsByRepository,
    defaultClient:
      settings.defaultClient === undefined
        ? undefined
        : clientFor(settings.defaultClient, clients),
    projectNamesByRepository,
  };
}

function clientFor(clientId, clients) {
  const client = clients.get(clientId);
  if (client === undefined)
    throw new Error(`Unknown billable client: ${clientId}.`);
  return client;
}

function parseSettings(value) {
  if (value === undefined || value === "{}") return undefined;
  const parsedValue = typeof value === "string" ? JSON.parse(value) : value;
  return settingsSchema.parse(parsedValue);
}

export default parseBillableTimeConfig;
