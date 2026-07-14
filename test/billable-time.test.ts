import assert from "node:assert/strict"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"

import { parseBillableTimeConfig } from "../src/billable-time/config.js"
import type { AttentionTokenRecord } from "../src/billable-time/domain/record.js"
import { BillableTimeRecorder } from "../src/billable-time/recorder.js"
import { summarizeBillableRecords } from "../src/billable-time/summary.js"

const repository = "github.com/klondikemarlen/omp-developer-attention-status"

function config() {
  return parseBillableTimeConfig({
    clients: {
      icefog: {
        label: "Icefog",
        currency: "cad",
        attentionRatePerHour: "120",
        aiRatePerHour: "30",
      },
    },
    repositories: { [repository]: "icefog" },
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
    currency: "CAD",
  }
  const summary = summarizeBillableRecords(Array.from({ length: 12 }, () => token))

  assert.deepEqual(summary, [{
    clientId: "icefog",
    clientLabel: "Icefog",
    currency: "CAD",
    ratePerHour: "123.45",
    sourceKind: "attention",
    count: 12,
    durationMs: 3_600_000,
    amount: "123.45",
  }])
})
