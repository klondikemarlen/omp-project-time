import type { BillableClient, BillableTimeConfig } from "@/billable-time/config.js"
import {
  closeAiInterval,
  createAttentionToken,
  startAiInterval,
  type AiIntervalRecord,
  type BillableAttribution,
  type BillableRecord,
  type PendingAiInterval,
} from "@/billable-time/domain/record.js"
import { normalizeBillableRepository } from "@/billable-time/domain/repository.js"
import type { BillableDescription } from "@/billable-time/domain/description.js"
import {
  createBillableWorkEntries,
  type BillableWorkEntry,
} from "@/billable-time/domain/work-entry.js"
import { BillableTimeRepository } from "@/billable-time/infrastructure/ndjson-repository.js"
import { summarizeBillableRecords, type BillableSummary } from "@/billable-time/summary.js"
import { resolveGitRepository } from "@/time-log/infrastructure/git-repository.js"

export type BillablePromptResult = {
  started: boolean
  closedInterval: boolean
}

export class BillableTimeRecorder {
  private readonly repository: BillableTimeRepository
  private readonly pendingIntervals = new Map<string, PendingAiInterval>()
  private readonly closingIntervals = new Map<string, Promise<void>>()

  constructor(rootPath?: string) {
    this.repository = new BillableTimeRepository(rootPath)
  }

  async recordPrompt(
    sessionId: string,
    cwd: string,
    nowMs: number,
    config: BillableTimeConfig,
  ): Promise<BillablePromptResult> {
    const closedInterval = await this.closePendingInterval(sessionId, nowMs, "superseded")
    const mappedClient = await this.resolveClient(cwd, config)
    if (mappedClient === undefined) return { started: false, closedInterval }

    const attribution = this.attributionFor(
      sessionId,
      mappedClient.repository,
      mappedClient.client,
      mappedClient.projectId,
      mappedClient.projectName,
    )
    const attention = createAttentionToken(attribution, nowMs, mappedClient.client.attentionRatePerHour)
    const interval = startAiInterval(attribution, nowMs, mappedClient.client.aiRatePerHour)

    await this.repository.appendAttention(attention)
    this.pendingIntervals.set(sessionId, interval)

    return { started: true, closedInterval }
  }

  async recordTurnEnd(sessionId: string, nowMs: number): Promise<boolean> {
    return this.closePendingInterval(sessionId, nowMs, "turn_end")
  }

  async recordShutdown(sessionId: string, nowMs: number): Promise<boolean> {
    return this.closePendingInterval(sessionId, nowMs, "shutdown")
  }

  async summaries(): Promise<BillableSummary[]> {
    return summarizeBillableRecords(await this.repository.records())
  }

  async recordDescription(description: BillableDescription): Promise<void> {
    await this.repository.appendDescription(description)
  }

  async records(): Promise<BillableRecord[]> {
    return this.repository.records()
  }

  async descriptions(): Promise<BillableDescription[]> {
    return this.repository.descriptions()
  }

  async workEntries(): Promise<BillableWorkEntry[]> {
    const [records, descriptions] = await Promise.all([
      this.repository.records(),
      this.repository.descriptions(),
    ])
    return createBillableWorkEntries(records, descriptions)
  }

  async descriptionFor(sessionId: string): Promise<BillableDescription | undefined> {
    const descriptions = await this.repository.descriptions()

    for (let index = descriptions.length - 1; index >= 0; index -= 1) {
      const description = descriptions[index]
      if (description.sessionId === sessionId) return description
    }

    return undefined
  }

  private async closePendingInterval(
    sessionId: string,
    nowMs: number,
    terminalReason: AiIntervalRecord["terminalReason"],
  ): Promise<boolean> {
    const existingClose = this.closingIntervals.get(sessionId)
    if (existingClose !== undefined) {
      await existingClose
      return false
    }

    const pending = this.pendingIntervals.get(sessionId)
    if (pending === undefined) return false

    const interval = closeAiInterval(pending, nowMs, terminalReason)
    const close = this.repository.appendAiInterval(interval).then(() => {
      this.pendingIntervals.delete(sessionId)
    })
    this.closingIntervals.set(sessionId, close)
    try {
      await close
    } finally {
      this.closingIntervals.delete(sessionId)
    }

    return true
  }

  private async resolveClient(cwd: string, config: BillableTimeConfig) {
    const gitRepository = await resolveGitRepository(cwd)
    if (gitRepository === undefined) return undefined

    const repository = normalizeBillableRepository(
      gitRepository.identity ?? gitRepository.repositoryId,
    )
    const client = config.clientsByRepository.get(repository) ?? config.defaultClient
    if (client === undefined) return undefined

    return {
      repository,
      client,
      projectId: repository,
      projectName: config.projectNamesByRepository.get(repository) ?? gitRepository.project,
    }
  }

  private attributionFor(
    sessionId: string,
    repository: string,
    client: BillableClient,
    projectId: string,
    projectName: string,
  ): BillableAttribution {
    return {
      sessionId,
      clientId: client.id,
      clientLabel: client.label,
      repository,
      projectId,
      projectName,
      currency: client.currency,
    }
  }
}

export default BillableTimeRecorder
