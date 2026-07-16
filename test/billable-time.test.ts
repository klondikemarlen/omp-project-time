import assert from "node:assert/strict"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"

import { parseBillableTimeConfig } from "../src/billable-time/config.js"
import {
  closeAiInterval,
  type AttentionTokenRecord,
  type PendingAiInterval,
} from "../src/billable-time/domain/record.js"
import type { BillableDescription } from "../src/billable-time/domain/description.js"
import { BillableTimeRecorder } from "../src/billable-time/recorder.js"
import { BillableTimeRepository } from "../src/billable-time/infrastructure/ndjson-repository.js"
import { summarizeBillableRecords } from "../src/billable-time/summary.js"
import { billableWorkEntryPreview } from "../src/billable-time/presentation.js"

const repository = "github.com/klondikemarlen/omp-project-time"

function config(category?: { id: string; label: string }) {
  return parseBillableTimeConfig({
    clients: {
      icefog: {
        label: "Icefog",
        attentionRatePerHour: "120",
        aiRatePerHour: "30",
      },
    },
    repositories: { [repository]: "icefog" },
    categories: category === undefined ? undefined : { [repository]: category },
  })
}


test("records separate five-minute attention tokens and AI intervals", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "billable-time-"))
  const startedAtMs = Date.UTC(2026, 6, 14, 12, 0, 0)

  try {
    const recorder = new BillableTimeRecorder(root)
    await recorder.recordPrompt("session", process.cwd(), startedAtMs, config())
    await recorder.recordTurnEnd("session", startedAtMs + 90_000)

    const attention = JSON.parse(await readFile(path.join(root, "attention-tokens.ndjson"), "utf8"))
    const interval = JSON.parse(await readFile(path.join(root, "ai-intervals.ndjson"), "utf8"))

    assert.equal(attention.durationMs, 300_000)
    assert.equal(attention.ratePerHour, "120")
    assert.equal(interval.durationMs, 90_000)
    assert.equal(interval.ratePerHour, "30")
    assert.equal(interval.terminalReason, "turn_end")
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("records repeated prompts as independent attention tokens and AI intervals", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "billable-time-"))
  const startedAtMs = Date.UTC(2026, 6, 14, 12, 0, 0)

  try {
    const recorder = new BillableTimeRecorder(root)
    await recorder.recordPrompt("session", process.cwd(), startedAtMs, config())
    await recorder.recordPrompt("session", process.cwd(), startedAtMs + 60_000, config())
    await recorder.recordTurnEnd("session", startedAtMs + 90_000)

    const attentionContent = await readFile(path.join(root, "attention-tokens.ndjson"), "utf8")
    const intervalContent = await readFile(path.join(root, "ai-intervals.ndjson"), "utf8")
    const attentionTokens = attentionContent.trim().split("\n").map((line) => JSON.parse(line))
    const aiIntervals = intervalContent.trim().split("\n").map((line) => JSON.parse(line))

    assert.equal(attentionTokens.length, 2)
    assert.equal(aiIntervals.length, 2)
    assert.deepEqual(aiIntervals.map((interval) => interval.terminalReason), ["superseded", "turn_end"])
    assert.deepEqual(aiIntervals.map((interval) => interval.durationMs), [60_000, 30_000])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("does not record unmapped repositories", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "billable-time-"))
  const unmappedConfig = parseBillableTimeConfig({
    clients: {
      icefog: {
        label: "Icefog",
        attentionRatePerHour: "120",
        aiRatePerHour: "30",
      },
    },
    repositories: {},
  })

  try {
    const recorder = new BillableTimeRecorder(root)
    await recorder.recordPrompt("session", process.cwd(), Date.UTC(2026, 6, 14, 12, 0, 0), unmappedConfig)
    await recorder.recordTurnEnd("session", Date.UTC(2026, 6, 14, 12, 1, 0))

    assert.deepEqual(await recorder.summaries(), [])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("closes an in-flight AI interval once during shutdown", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "billable-time-"))
  const startedAtMs = Date.UTC(2026, 6, 14, 12, 0, 0)

  try {
    const recorder = new BillableTimeRecorder(root)
    await recorder.recordPrompt("session", process.cwd(), startedAtMs, config())
    await recorder.recordShutdown("session", startedAtMs + 90_000)
    await recorder.recordShutdown("session", startedAtMs + 120_000)

    const intervalContent = await readFile(path.join(root, "ai-intervals.ndjson"), "utf8")
    const aiIntervals = intervalContent.trim().split("\n").map((line) => JSON.parse(line))

    assert.equal(aiIntervals.length, 1)
    assert.equal(aiIntervals[0].terminalReason, "shutdown")
    assert.equal(aiIntervals[0].durationMs, 90_000)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("snapshots policy rates and summarizes attention and AI clocks separately", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "billable-time-"))
  const firstStartedAtMs = Date.UTC(2026, 6, 14, 12, 0, 0)
  const changedPolicy = parseBillableTimeConfig({
    clients: {
      icefog: {
        label: "Icefog",
        attentionRatePerHour: "240",
        aiRatePerHour: "60",
      },
    },
    repositories: { [repository]: "icefog" },
  })

  try {
    const recorder = new BillableTimeRecorder(root)
    await recorder.recordPrompt("first", process.cwd(), firstStartedAtMs, config())
    await recorder.recordTurnEnd("first", firstStartedAtMs + 3_600_000)
    await recorder.recordPrompt("second", process.cwd(), firstStartedAtMs + 7_200_000, changedPolicy)
    await recorder.recordTurnEnd("second", firstStartedAtMs + 10_800_000)

    assert.deepEqual(await recorder.summaries(), [
      { clientId: "icefog", clientLabel: "Icefog", ratePerHour: "120", sourceKind: "attention", count: 1, durationMs: 300_000, amount: "10" },
      { clientId: "icefog", clientLabel: "Icefog", ratePerHour: "240", sourceKind: "attention", count: 1, durationMs: 300_000, amount: "20" },
      { clientId: "icefog", clientLabel: "Icefog", ratePerHour: "30", sourceKind: "ai", count: 1, durationMs: 3_600_000, amount: "30" },
      { clientId: "icefog", clientLabel: "Icefog", ratePerHour: "60", sourceKind: "ai", count: 1, durationMs: 3_600_000, amount: "60" },
    ])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("renders provider-neutral preview entries with separate source clocks", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "billable-time-"))
  const startedAtMs = Date.UTC(2026, 6, 14, 12, 0, 0)
  const description: BillableDescription = {
    sessionId: "session",
    description: "Implement notification suppression",
    source: "explicit",
    recordedAtMs: startedAtMs,
  }

  try {
    const recorder = new BillableTimeRecorder(root)
    await recorder.recordPrompt("session", process.cwd(), startedAtMs, config())
    await recorder.recordTurnEnd("session", startedAtMs + 90_000)
    await recorder.recordDescription(description)

    const preview = JSON.parse(billableWorkEntryPreview(await recorder.workEntries()))

    assert.deepEqual(preview, [
      {
        client_id: "icefog",
        client_label: "Icefog",
        project_id: repository,
        project_name: "omp-project-time",
        source_kind: "attention",
        duration_ms: 300_000,
        rate_per_hour: "120",
        description: "Implement notification suppression",
        emitted_at_ms: startedAtMs,
      },
      {
        client_id: "icefog",
        client_label: "Icefog",
        project_id: repository,
        project_name: "omp-project-time",
        source_kind: "ai",
        duration_ms: 90_000,
        rate_per_hour: "30",
        description: "Implement notification suppression",
        started_at_ms: startedAtMs,
        ended_at_ms: startedAtMs + 90_000,
      },
    ])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("snapshots configured categories in records, summaries, and previews", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "billable-time-"))
  const startedAtMs = Date.UTC(2026, 6, 14, 12, 0, 0)

  try {
    const recorder = new BillableTimeRecorder(root)
    await recorder.recordPrompt("session", process.cwd(), startedAtMs, config({
      id: "programming",
      label: "Programming",
    }))
    await recorder.recordTurnEnd("session", startedAtMs + 90_000)

    assert.deepEqual((await recorder.records()).map((record) => ({
      sourceKind: record.sourceKind,
      categoryId: record.categoryId,
      categoryLabel: record.categoryLabel,
    })), [
      { sourceKind: "attention", categoryId: "programming", categoryLabel: "Programming" },
      { sourceKind: "ai", categoryId: "programming", categoryLabel: "Programming" },
    ])
    assert.deepEqual(await recorder.summaries(), [
      {
        clientId: "icefog",
        clientLabel: "Icefog",
        categoryId: "programming",
        categoryLabel: "Programming",
        ratePerHour: "120",
        sourceKind: "attention",
        count: 1,
        durationMs: 300_000,
        amount: "10",
      },
      {
        clientId: "icefog",
        clientLabel: "Icefog",
        categoryId: "programming",
        categoryLabel: "Programming",
        ratePerHour: "30",
        sourceKind: "ai",
        count: 1,
        durationMs: 90_000,
        amount: "0.75",
      },
    ])
    const preview = JSON.parse(billableWorkEntryPreview(await recorder.workEntries()))
    assert.deepEqual(preview.map((entry: { category_id: string; category_label: string }) => ({
      categoryId: entry.category_id,
      categoryLabel: entry.category_label,
    })), [
      { categoryId: "programming", categoryLabel: "Programming" },
      { categoryId: "programming", categoryLabel: "Programming" },
    ])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("totals twelve attention tokens at one exact decimal hourly rate", () => {
  const token: AttentionTokenRecord = {
    emittedAtMs: 0,
    sessionId: "session",
    clientId: "icefog",
    clientLabel: "Icefog",
    repository,
    sourceKind: "attention",
    durationMs: 300_000,
    ratePerHour: "123.45",
  }
  const summary = summarizeBillableRecords(Array.from({ length: 12 }, () => token))

  assert.deepEqual(summary, [{
    clientId: "icefog",
    clientLabel: "Icefog",
    ratePerHour: "123.45",
    sourceKind: "attention",
    count: 12,
    durationMs: 3_600_000,
    amount: "123.45",
  }])
})

test("closes AI intervals at their start time when given an earlier terminal time", () => {
  const pending: PendingAiInterval = {
    startedAtMs: 1_000,
    sessionId: "session",
    clientId: "icefog",
    clientLabel: "Icefog",
    repository,
    sourceKind: "ai",
    ratePerHour: "30",
  }

  const interval = closeAiInterval(pending, 999, "turn_end")

  assert.equal(interval.endedAtMs, 1_000)
  assert.equal(interval.durationMs, 0)
})

test("serializes concurrent attention token appends", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "billable-time-"))
  const first: AttentionTokenRecord = {
    emittedAtMs: 0,
    sessionId: "first",
    clientId: "icefog",
    clientLabel: "Icefog",
    repository,
    sourceKind: "attention",
    durationMs: 300_000,
    ratePerHour: "120",
  }
  const second: AttentionTokenRecord = {
    ...first,
    emittedAtMs: 1,
    sessionId: "second",
  }

  try {
    const firstRepository = new BillableTimeRepository(root)
    const secondRepository = new BillableTimeRepository(root)
    await Promise.all([
      firstRepository.appendAttention(first),
      secondRepository.appendAttention(second),
    ])

    const records = await firstRepository.records()
    assert.deepEqual(records.map((record) => record.sessionId).sort(), ["first", "second"])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("preserves a complete final record without a newline during append recovery", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "billable-time-"))
  const attentionPath = path.join(root, "attention-tokens.ndjson")
  const token: AttentionTokenRecord = {
    emittedAtMs: 0,
    sessionId: "session",
    clientId: "icefog",
    clientLabel: "Icefog",
    repository,
    sourceKind: "attention",
    durationMs: 300_000,
    ratePerHour: "120",
  }

  try {
    await writeFile(attentionPath, JSON.stringify(token))
    const billableTimeRepository = new BillableTimeRepository(root)

    assert.deepEqual(await billableTimeRepository.records(), [token])
    await billableTimeRepository.appendAttention(token)
    assert.deepEqual(await billableTimeRepository.records(), [token, token])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("removes a partial UTF-8 tail before appending", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "billable-time-"))
  const attentionPath = path.join(root, "attention-tokens.ndjson")
  const token: AttentionTokenRecord = {
    emittedAtMs: 0,
    sessionId: "session",
    clientId: "icefog",
    clientLabel: "Mårlen",
    repository,
    sourceKind: "attention",
    durationMs: 300_000,
    ratePerHour: "120",
  }

  try {
    await writeFile(attentionPath, `${JSON.stringify(token)}\n{"partial":`)
    const billableTimeRepository = new BillableTimeRepository(root)

    await billableTimeRepository.appendAttention(token)

    assert.deepEqual(await billableTimeRepository.records(), [token, token])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("reports the path and line for malformed billable JSON", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "billable-time-"))
  const attentionPath = path.join(root, "attention-tokens.ndjson")

  try {
    await writeFile(attentionPath, "{not json}\n")
    const billableTimeRepository = new BillableTimeRepository(root)

    await assert.rejects(billableTimeRepository.records(), /Invalid JSON at .*attention-tokens\.ndjson:1\./)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
