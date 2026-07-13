import assert from "node:assert/strict"
import { mkdir, mkdtemp, rm, utimes } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"

import { emptyDeveloperCostState, parseDeveloperCostConfig } from "../src/billing/index.js"
import { SpreadBillingLedger } from "../src/billing/infrastructure/spread-ledger.js"
import { lock } from "../src/vendor/proper-lockfile.js"

async function withLedgerPath(check: (ledgerPath: string) => Promise<void>) {
  const directory = await mkdtemp(path.join(tmpdir(), "developer-cost-lock-"))
  const ledgerPath = path.join(directory, "spread-billing.json")

  try {
    await check(ledgerPath)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}

test("recovers shared billing from a stale OMP lock", async () => {
  await withLedgerPath(async (ledgerPath) => {
    const staleLockPath = `${ledgerPath}.lock`
    await mkdir(staleLockPath)

    const staleAt = new Date(Date.now() - 6_000)
    await utimes(staleLockPath, staleAt, staleAt)

    const ledger = new SpreadBillingLedger(ledgerPath)
    const state = await ledger.recordPrompt(
      "session",
      emptyDeveloperCostState(),
      0,
      parseDeveloperCostConfig(),
    )

    assert.equal(state.promptCount, 1)
  })
})

test("bounds shared billing waits for a live OMP lock", async () => {
  await withLedgerPath(async (ledgerPath) => {
    const release = await lock(ledgerPath, { realpath: false })
    const ledger = new SpreadBillingLedger(ledgerPath)
    const startedAt = Date.now()

    try {
      await assert.rejects(
        ledger.recordPrompt(
          "session",
          emptyDeveloperCostState(),
          0,
          parseDeveloperCostConfig(),
        ),
      )
    } finally {
      await release()
    }

    assert.ok(Date.now() - startedAt < 10_000)
  })
})
