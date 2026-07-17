import { positiveRateSchema } from "../billable-time/domain/rate.js";
import { normalizeBillableRepository } from "../billable-time/domain/repository.js";
import { z } from "../vendor/zod.js";

const idLabelSchema = z.object({
  id: z.string().trim().min(1),
  label: z.string().trim().min(1),
});
const repositoryPolicySchema = z.object({
  project: idLabelSchema,
  category: idLabelSchema,
});
const repositoryTimesheetSettingsSchema = z.object({
  repositories: z.record(z.string(), repositoryPolicySchema),
});
const clientSchema = z.object({
  label: z.string().trim().min(1),
  attentionRatePerHour: positiveRateSchema,
  aiRatePerHour: positiveRateSchema,
});
const legacySettingsSchema = z.object({
  clients: z.record(z.string(), clientSchema),
  defaultClient: z.string().trim().min(1).optional(),
  projects: z.record(z.string(), z.string().trim().min(1)).optional(),
  categories: z.record(z.string(), idLabelSchema).optional(),
  repositories: z.record(z.string(), z.string().trim().min(1)).optional(),
});
export function parseBillableTimeConfig(value) {
  const parsedValue = parseSettings(value);
  if (parsedValue === undefined) return emptyConfig();
  const timesheet = repositoryTimesheetSettingsSchema.safeParse(parsedValue);
  if (timesheet.success) {
    const policiesByRepository = new Map();
    for (const [repository, policy] of Object.entries(
      timesheet.data.repositories,
    )) {
      policiesByRepository.set(normalizeBillableRepository(repository), policy);
    }
    return { ...emptyConfig(), policiesByRepository };
  }
  const legacy = legacySettingsSchema.parse(parsedValue);
  const clients = new Map();
  for (const [id, client] of Object.entries(legacy.clients))
    clients.set(id, { id, ...client });
  const clientsByRepository = new Map();
  for (const [repository, clientId] of Object.entries(
    legacy.repositories ?? {},
  )) {
    clientsByRepository.set(
      normalizeBillableRepository(repository),
      clientFor(clientId, clients),
    );
  }
  const projectNamesByRepository = new Map();
  for (const [repository, name] of Object.entries(legacy.projects ?? {})) {
    projectNamesByRepository.set(normalizeBillableRepository(repository), name);
  }
  const categoriesByRepository = new Map();
  for (const [repository, category] of Object.entries(
    legacy.categories ?? {},
  )) {
    categoriesByRepository.set(
      normalizeBillableRepository(repository),
      category,
    );
  }
  return {
    ...emptyConfig(),
    clientsByRepository,
    defaultClient:
      legacy.defaultClient === undefined
        ? undefined
        : clientFor(legacy.defaultClient, clients),
    projectNamesByRepository,
    categoriesByRepository,
  };
}

function emptyConfig() {
  return {
    policiesByRepository: new Map(),
    clientsByRepository: new Map(),
    projectNamesByRepository: new Map(),
    categoriesByRepository: new Map(),
  };
}

function clientFor(clientId, clients) {
  const client = clients.get(clientId);
  if (client === undefined)
    throw new Error(`Unknown billable client: ${clientId}.`);
  return client;
}

function parseSettings(value) {
  if (value === undefined || value === "disabled" || value === "{}")
    return undefined;
  return typeof value === "string" ? JSON.parse(value) : value;
}

export default parseBillableTimeConfig;
