import { appendFile, mkdir, readFile } from "node:fs/promises"
import { homedir } from "node:os"
import path from "node:path"

import type { BillableTimeConfig } from "@/billable-time/config.js"
import type { AiIntervalRecord, AttentionTokenRecord } from "@/billable-time/domain/record.js"
import { resolveGitRepository } from "@/time-log/infrastructure/git-repository.js"
import { parseAiIntervalRecord, parseAttentionTokenRecord, type BillableRecord } from "@/billable-time/domain/record.js"
import { summarizeBillableRecords, type BillableSummary } from "@/billable-time/summary.js"
import { lock } from "@/vendor/proper-lockfile.js"

const ATTENTION_DURATION_MS = 5 * 60 * 1000

type PendingInterval = Omit<AiIntervalRecord, "endedAtMs" | "durationMs" | "terminalReason">

export class BillableTimeRecorder {
  private readonly attentionPath: string
  private readonly aiPath: string
  private readonly pendingIntervals = new Map<string, PendingInterval>()
  private readonly closingIntervals = new Map<string, Promise<void>>()

  constructor(rootPath = path.join(homedir(), ".omp", "developer-attention-status")) {
    this.attentionPath = path.join(rootPath, "attention-tokens.ndjson")
    this.aiPath = path.join(rootPath, "ai-intervals.ndjson")
  }

  async recordPrompt(sessionId: string, cwd: string, nowMs: number, config: BillableTimeConfig): Promise<void> {
    await this.closeInterval(sessionId, nowMs, "superseded")

    const repository = await this.repositoryFor(cwd)
    if (repository === undefined) return
    const client = config.clientsByRepository.get(repository)
    if (client === undefined) return

    const token: AttentionTokenRecord = {
      emittedAtMs: nowMs,
      sessionId,
      clientId: client.id,
      clientLabel: client.label,
      repository,
      sourceKind: "attention",
      durationMs: ATTENTION_DURATION_MS,
      ratePerHour: client.attentionRatePerHour,
      currency: client.currency,
    }
    await this.append(this.attentionPath, token)

    this.pendingIntervals.set(sessionId, {
      startedAtMs: nowMs,
      sessionId,
      clientId: client.id,
      clientLabel: client.label,
      repository,
      sourceKind: "ai",
      ratePerHour: client.aiRatePerHour,
      currency: client.currency,
    })
  }

  async summaries(): Promise<BillableSummary[]> {
    const [attention, intervals] = await Promise.all([
      this.records(this.attentionPath, parseAttentionTokenRecord),
      this.records(this.aiPath, parseAiIntervalRecord),
    ])
    return summarizeBillableRecords([...attention, ...intervals])
  }

  async recordTurnEnd(sessionId: string, nowMs: number): Promise<void> {
    await this.closeInterval(sessionId, nowMs, "turn_end")
  }

  async recordShutdown(sessionId: string, nowMs: number): Promise<void> {
    await this.closeInterval(sessionId, nowMs, "shutdown")
  }

  private async closeInterval(sessionId: string, nowMs: number, terminalReason: AiIntervalRecord["terminalReason"]): Promise<void> {
    const previousClose = this.closingIntervals.get(sessionId)
    if (previousClose !== undefined) return previousClose

    const pending = this.pendingIntervals.get(sessionId)
    if (pending === undefined) return
    const endedAtMs = Math.max(nowMs, pending.startedAtMs)
    const interval: AiIntervalRecord = { ...pending, endedAtMs, durationMs: endedAtMs - pending.startedAtMs, terminalReason }
    const close = this.append(this.aiPath, interval).then(() => {
      if (this.pendingIntervals.get(sessionId) === pending) this.pendingIntervals.delete(sessionId)
    })
    this.closingIntervals.set(sessionId, close)
    try {
      await close
    } finally {
      if (this.closingIntervals.get(sessionId) === close) this.closingIntervals.delete(sessionId)
    }
  }

  private async repositoryFor(cwd: string): Promise<string | undefined> {
    const repository = await resolveGitRepository(cwd)
    return repository?.identity
  }

  private async records<T extends BillableRecord>(
    filePath: string,
    parse: (value: unknown) => T | undefined,
  ): Promise<T[]> {
    let content: string
    try {
      content = await readFile(filePath, "utf8")
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return []
      throw error
    }

    const records: T[] = []
    for (const line of content.split("\n").filter(Boolean)) {
      const record = parse(JSON.parse(line))
      if (record === undefined) throw new Error(`Invalid billable record in ${filePath}.`)
      records.push(record)
    }
    return records
  }

  private async append(filePath: string, value: AttentionTokenRecord | AiIntervalRecord): Promise<void> {
    await mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 })
    const release = await lock(filePath, { realpath: false, stale: 5_000, update: 2_500, retries: { retries: 10, factor: 1.5, minTimeout: 100, maxTimeout: 1_000 } })
    try {
      await appendFile(filePath, `${JSON.stringify(value)}\n`, { mode: 0o600 })
    } finally {
      await release()
    }
  }
}

export default BillableTimeRecorder
