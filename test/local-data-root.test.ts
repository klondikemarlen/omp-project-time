import assert from "node:assert/strict"
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"

import { prepareProjectTimeDataRoot } from "../src/extension/local-data-root.js"

test("replaces legacy local tracking data once and retains new records", async () => {
  const root = path.join(tmpdir(), `project-time-reset-${Date.now()}`)
  const oldRoot = path.join(root, "developer-attention-status")
  const newRoot = path.join(root, "project-time")
  const oldSpreadLedgerDirectory = path.join(root, "developer-cost-status")
  const markerPath = path.join(newRoot, ".project-time-v4")
  const newRecordPath = path.join(newRoot, "attention-tokens.ndjson")

  try {
    await Promise.all([
      mkdir(oldRoot, { recursive: true, mode: 0o700 }),
      mkdir(newRoot, { recursive: true, mode: 0o700 }),
      mkdir(oldSpreadLedgerDirectory, { recursive: true, mode: 0o700 }),
    ])
    await Promise.all([
      writeFile(path.join(oldRoot, "attention-tokens.ndjson"), "legacy attention\n", { mode: 0o600 }),
      writeFile(path.join(newRoot, "ai-intervals.ndjson"), "legacy interval\n", { mode: 0o600 }),
      writeFile(path.join(oldSpreadLedgerDirectory, "spread-billing.json"), "legacy spread\n", { mode: 0o600 }),
    ])

    await prepareProjectTimeDataRoot(newRoot, oldRoot, oldSpreadLedgerDirectory)

    await assert.rejects(readFile(path.join(oldRoot, "attention-tokens.ndjson")))
    await assert.rejects(readFile(path.join(newRoot, "ai-intervals.ndjson")))
    await assert.rejects(readFile(path.join(oldSpreadLedgerDirectory, "spread-billing.json")))
    assert.equal(await readFile(markerPath, "utf8"), "project-time-v4\n")
    assert.equal((await stat(newRoot)).mode & 0o777, 0o700)
    assert.equal((await stat(markerPath)).mode & 0o777, 0o600)

    await writeFile(newRecordPath, "attention\n", { mode: 0o600 })
    await prepareProjectTimeDataRoot(newRoot, oldRoot, oldSpreadLedgerDirectory)

    assert.equal(await readFile(newRecordPath, "utf8"), "attention\n")
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("resets records marked by the previous data model", async () => {
  const root = path.join(tmpdir(), `project-time-marker-${Date.now()}`)
  const newRoot = path.join(root, "project-time")
  const priorMarkerPath = path.join(newRoot, ".project-time-v3")
  const markerPath = path.join(newRoot, ".project-time-v4")
  const recordPath = path.join(newRoot, "time-log.json")

  try {
    await mkdir(newRoot, { recursive: true, mode: 0o700 })
    await Promise.all([
      writeFile(priorMarkerPath, "project-time-v3\n", { mode: 0o600 }),
      writeFile(recordPath, "legacy time log\n", { mode: 0o600 }),
    ])

    await prepareProjectTimeDataRoot(newRoot)

    assert.equal(await readFile(markerPath, "utf8"), "project-time-v4\n")
    await assert.rejects(readFile(recordPath))
    await assert.rejects(readFile(priorMarkerPath))
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
