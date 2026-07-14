import {
  closeAiInterval,
  createAttentionToken,
  startAiInterval,
} from "../billable-time/domain/record.js";
import { normalizeBillableRepository } from "../billable-time/domain/repository.js";
import { createBillableWorkEntries } from "../billable-time/domain/work-entry.js";
import { BillableTimeRepository } from "../billable-time/infrastructure/ndjson-repository.js";
import { summarizeBillableRecords } from "../billable-time/summary.js";
import { resolveGitRepository } from "../time-log/infrastructure/git-repository.js";

export class BillableTimeRecorder {
  repository;

  pendingIntervals = new Map();

  closingIntervals = new Map();

  constructor(rootPath) {
    this.repository = new BillableTimeRepository(rootPath);
  }

  async recordPrompt(sessionId, cwd, nowMs, config) {
    const closedInterval = await this.closePendingInterval(
      sessionId,
      nowMs,
      "superseded",
    );
    const mappedClient = await this.resolveClient(cwd, config);
    if (mappedClient === undefined) return { started: false, closedInterval };
    const attribution = this.attributionFor(
      sessionId,
      mappedClient.repository,
      mappedClient.client,
      mappedClient.projectId,
      mappedClient.projectName,
    );
    const attention = createAttentionToken(
      attribution,
      nowMs,
      mappedClient.client.attentionRatePerHour,
    );
    const interval = startAiInterval(
      attribution,
      nowMs,
      mappedClient.client.aiRatePerHour,
    );
    await this.repository.appendAttention(attention);
    this.pendingIntervals.set(sessionId, interval);
    return { started: true, closedInterval };
  }

  async recordTurnEnd(sessionId, nowMs) {
    return this.closePendingInterval(sessionId, nowMs, "turn_end");
  }

  async recordShutdown(sessionId, nowMs) {
    return this.closePendingInterval(sessionId, nowMs, "shutdown");
  }

  async summaries() {
    return summarizeBillableRecords(await this.repository.records());
  }

  async recordDescription(description) {
    await this.repository.appendDescription(description);
  }

  async records() {
    return this.repository.records();
  }

  async descriptions() {
    return this.repository.descriptions();
  }

  async workEntries() {
    const [records, descriptions] = await Promise.all([
      this.repository.records(),
      this.repository.descriptions(),
    ]);
    return createBillableWorkEntries(records, descriptions);
  }

  async descriptionFor(sessionId) {
    const descriptions = await this.repository.descriptions();
    for (let index = descriptions.length - 1; index >= 0; index -= 1) {
      const description = descriptions[index];
      if (description.sessionId === sessionId) return description;
    }
    return undefined;
  }

  async closePendingInterval(sessionId, nowMs, terminalReason) {
    const existingClose = this.closingIntervals.get(sessionId);
    if (existingClose !== undefined) {
      await existingClose;
      return false;
    }
    const pending = this.pendingIntervals.get(sessionId);
    if (pending === undefined) return false;
    const interval = closeAiInterval(pending, nowMs, terminalReason);
    const close = this.repository.appendAiInterval(interval).then(() => {
      this.pendingIntervals.delete(sessionId);
    });
    this.closingIntervals.set(sessionId, close);
    try {
      await close;
    } finally {
      this.closingIntervals.delete(sessionId);
    }
    return true;
  }

  async resolveClient(cwd, config) {
    const gitRepository = await resolveGitRepository(cwd);
    if (gitRepository === undefined) return undefined;
    const repository = normalizeBillableRepository(
      gitRepository.identity ?? gitRepository.repositoryId,
    );
    const client =
      config.clientsByRepository.get(repository) ?? config.defaultClient;
    if (client === undefined) return undefined;
    return {
      repository,
      client,
      projectId: repository,
      projectName:
        config.projectNamesByRepository.get(repository) ??
        gitRepository.project,
    };
  }

  attributionFor(sessionId, repository, client, projectId, projectName) {
    return {
      sessionId,
      clientId: client.id,
      clientLabel: client.label,
      repository,
      projectId,
      projectName,
      currency: client.currency,
    };
  }
}

export default BillableTimeRecorder;
