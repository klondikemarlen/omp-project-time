import assert from "node:assert/strict"
import { mkdtemp, readFile, rm, stat } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"

import { TimeLogLedger } from "../src/time-log/infrastructure/ledger.js"
import type { AutomaticTimeLogInput, TimeLogEntry } from "../src/time-log/domain/model.js"
import { createAutomaticTimeLogEntry } from "../src/time-log/domain/create-automatic-entry.js"
import { recordAutomaticTimeLogEntry } from "../src/time-log/domain/record-automatic-entry.js"
import { lock } from "../src/vendor/proper-lockfile.js"

const minute = 60_000
const start = Date.UTC(2026, 0, 1)

type ExpectedEntry = {
  sourceKind: "human_active" | "agent_turn_elapsed"
  endAtMs: number
  project: string
  repositoryId: string
  startAtMs: number
}

async function withLedger(
  check: (ledger: TimeLogLedger, ledgerPath: string) => void | Promise<void>,
) {
  const directory = await mkdtemp(path.join(tmpdir(), "time-log-test-"))
  const ledgerPath = path.join(directory, "ledger.json")

  try {
    await check(new TimeLogLedger(ledgerPath), ledgerPath)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}

function assertEntries(
  entries: readonly TimeLogEntry[],
  expected: readonly ExpectedEntry[],
) {
  for (const entry of entries) {
    assert.notEqual(entry.id, "")
    assert.ok(Number.isFinite(entry.createdAtMs))
  }

  assert.deepEqual(
    entries.map(({ id: _id, createdAtMs: _createdAtMs, ...entry }) => entry),
    expected,
  )
}

test("limits automatic human intervals to the settled attention duration", () => {
  const entry = createAutomaticTimeLogEntry({
    nowMs: 6 * minute,
    repository: { project: "Project A", repositoryId: "repository-a" },
    sessionId: "session-a",
    sourceStartedAtMs: 0,
    stateBeforeSettlement: {
      promptCount: 1,
      activeMilliseconds: 0,
      activeStartAtMs: 0,
      activeUntilMs: 5 * minute,
      lastPromptAtMs: 0,
    },
    settledState: {
      promptCount: 1,
      activeMilliseconds: minute,
      activeStartAtMs: 0,
      activeUntilMs: 5 * minute,
      lastSettledAtMs: 5 * minute,
      lastPromptAtMs: 0,
    },
  })

  assert.deepEqual(entry, {
    sourceKind: "human_active",
    project: "Project A",
    repositoryId: "repository-a",
    sessionId: "session-a",
    sourceKey: "session-a:repository-a:0",
    startAtMs: 4 * minute,
    endAtMs: 5 * minute,
  })
})

test("extends automatic entries by source key in the domain", () => {
  const entries: TimeLogEntry[] = []
  const first = recordAutomaticTimeLogEntry(
    entries,
    {
      sourceKind: "human_active",
      project: "github.com/acme/alpha",
      repositoryId: "repo-alpha",
      sourceKey: "activity-2026-01-01T00:00:00Z",
      startAtMs: start,
      endAtMs: start + minute,
    },
    start,
  )
  const extended = recordAutomaticTimeLogEntry(
    entries,
    {
      sourceKind: "human_active",
      project: "github.com/acme/alpha",
      repositoryId: "repo-alpha",
      sourceKey: "activity-2026-01-01T00:00:00Z",
      startAtMs: start + 2 * minute,
      endAtMs: start + 3 * minute,
    },
    start + minute,
  )

  assert.equal(first.changed, true)
  assert.equal(extended.changed, true)
  assert.equal(extended.entry.id, first.entry.id)
  assertEntries(entries, [
    {
      sourceKind: "human_active",
      project: "github.com/acme/alpha",
      repositoryId: "repo-alpha",
      startAtMs: start,
      endAtMs: start + 3 * minute,
    },
  ])
})

test("suppresses automatic intervals deterministically by source key", async () => {
  await withLedger(async (ledger) => {
    const first = await ledger.recordAutomatic({
      sourceKind: "human_active",
      project: "github.com/acme/alpha",
      repositoryId: "repo-alpha",
      sourceKey: "activity-2026-01-01T00:00:00Z",
      startAtMs: start,
      endAtMs: start + minute,
    })
    const replay = await ledger.recordAutomatic({
      sourceKind: "human_active",
      project: "github.com/acme/alpha",
      repositoryId: "repo-alpha",
      sourceKey: "activity-2026-01-01T00:00:00Z",
      startAtMs: start,
      endAtMs: start + minute,
    })

    assert.equal(replay.id, first.id)
    assertEntries(await ledger.entries(), [
      {
        sourceKind: "human_active",
        project: "github.com/acme/alpha",
        repositoryId: "repo-alpha",
        startAtMs: start,
        endAtMs: start + minute,
      },
    ])
  })
})

test("keeps overlapping automatic intervals from separate repositories", async () => {
  await withLedger(async (ledger, ledgerPath) => {
    await ledger.recordAutomatic({
      sourceKind: "human_active",
      project: "github.com/acme/alpha",
      repositoryId: "repo-alpha",
      sourceKey: "alpha-activity",
      startAtMs: start,
      endAtMs: start + 5 * minute,
    })
    await ledger.recordAutomatic({
      sourceKind: "human_active",
      project: "github.com/acme/beta",
      repositoryId: "repo-beta",
      sourceKey: "beta-activity",
      startAtMs: start + 2 * minute,
      endAtMs: start + 7 * minute,
    })

    const entries = await ledger.entries()
    const expected: ExpectedEntry[] = [
      {
        sourceKind: "human_active",
        project: "github.com/acme/alpha",
        repositoryId: "repo-alpha",
        startAtMs: start,
        endAtMs: start + 5 * minute,
      },
      {
        sourceKind: "human_active",
        project: "github.com/acme/beta",
        repositoryId: "repo-beta",
        startAtMs: start + 2 * minute,
        endAtMs: start + 7 * minute,
      },
    ]

    assertEntries(entries, expected)
    const exported = JSON.parse(await readFile(`${ledgerPath}.summary.json`, "utf8"))
    assert.deepEqual(Object.keys(exported.summaries), ["5", "10", "15"])
    assert.equal(exported.summaries[5].allocationMilliseconds, 10 * minute)
    assert.equal(exported.summaries[5].wallClockMilliseconds, 7 * minute)
    assert.equal(exported.summaries[10].allocationMilliseconds, 10 * minute)
    assert.equal(exported.summaries[15].allocationMilliseconds, 10 * minute)
  })
})

test("rejects incomplete automatic identities and non-positive intervals", async () => {
  await withLedger(async (ledger) => {
    for (const input of ([
      {
        sourceKind: "human_active",
        project: " ",
        repositoryId: "repo-alpha",
        sourceKey: "activity",
        startAtMs: start,
        endAtMs: start + minute,
      },
      {
        sourceKind: "human_active",
        project: "github.com/acme/alpha",
        repositoryId: "repo-alpha",
        sourceKey: " ",
        startAtMs: start,
        endAtMs: start + minute,
      },
      {
        sourceKind: "human_active",
        project: "github.com/acme/alpha",
        repositoryId: "repo-alpha",
        sourceKey: "empty-interval",
        startAtMs: start,
        endAtMs: start,
      },
      {
        sourceKind: "human_active",
        project: "github.com/acme/alpha",
        repositoryId: "repo-alpha",
        sourceKey: "reversed-interval",
        startAtMs: start + minute,
        endAtMs: start,
      },
    ] as const)) {
      await assert.rejects(() => ledger.recordAutomatic(input))
    }

    assertEntries(await ledger.entries(), [])
  })
})

test("persists automatic intervals and their deduplication keys", async () => {
  await withLedger(async (ledger, ledgerPath) => {
    const entry = await ledger.recordAutomatic({
      sourceKind: "human_active",
      project: "github.com/acme/alpha",
      repositoryId: "repo-alpha",
      sourceKey: "persisted-activity",
      startAtMs: start + minute,
      endAtMs: start + 3 * minute,
    })
    const reopenedLedger = new TimeLogLedger(ledgerPath)
    const replay = await reopenedLedger.recordAutomatic({
      sourceKind: "human_active",
      project: "github.com/acme/alpha",
      repositoryId: "repo-alpha",
      sourceKey: "persisted-activity",
      startAtMs: start + minute,
      endAtMs: start + 3 * minute,
    })

    assert.equal(replay.id, entry.id)
    assertEntries(await reopenedLedger.entries(), [
      {
        sourceKind: "human_active",
        project: "github.com/acme/alpha",
        repositoryId: "repo-alpha",
        startAtMs: start + minute,
        endAtMs: start + 3 * minute,
      },
    ])
  })
})

test("writes automatic ledgers with owner-only permissions", async () => {
  await withLedger(async (ledger, ledgerPath) => {
    await ledger.recordAutomatic({
      sourceKind: "human_active",
      project: "github.com/acme/alpha",
      repositoryId: "repo-alpha",
      sourceKey: "permission-check",
      startAtMs: start,
      endAtMs: start + minute,
    })

    assert.equal((await stat(ledgerPath)).mode & 0o777, 0o600)
    assert.equal((await stat(`${ledgerPath}.summary.json`)).mode & 0o777, 0o600)
  })
})

test("waits for another OMP window to release the time log lock", async () => {
  await withLedger(async (ledger, ledgerPath) => {
    const release = await lock(ledgerPath, { realpath: false })
    const releaseAfterContention = new Promise<void>((resolve) => {
      setTimeout(() => {
        resolve()
        void release()
      }, 750)
    })

    try {
      await ledger.recordAutomatic({
        sourceKind: "human_active",
        project: "github.com/acme/alpha",
        repositoryId: "repo-alpha",
        sourceKey: "contended-lock",
        startAtMs: start,
        endAtMs: start + minute,
      })
    } finally {
      await releaseAfterContention
    }

    assertEntries(await ledger.entries(), [
      {
        sourceKind: "human_active",
        project: "github.com/acme/alpha",
        repositoryId: "repo-alpha",
        startAtMs: start,
        endAtMs: start + minute,
      },
    ])
  })
})
