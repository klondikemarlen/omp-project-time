import assert from "node:assert/strict"
import { execFile as execFileCallback } from "node:child_process"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { promisify } from "node:util"
import test from "node:test"

const execFile = promisify(execFileCallback)

async function runCli(home: string, ...args: string[]) {
  return execFile(
    process.execPath,
    ["--import", "tsx", "src/project-time-cli.ts", ...args],
    { cwd: process.cwd(), env: { ...process.env, HOME: home } },
  )
}

test("when exporting entries from the direct binary, writes the complete JSON snapshot", async () => {
  // Arrange
  const home = await mkdtemp(path.join(tmpdir(), "project-time-cli-"))
  const narrative = Array.from({ length: 200 }, () => "Evidence").join(" ")
  const entry = {
    id: "wrap-human",
    sourceKind: "human_active",
    project: "wrap",
    repositoryId: "wrap-repository",
    sessionId: "session-wrap",
    narrative: { text: narrative, source: "generated" },
    workItemAttribution: "unassigned",
    startAtMs: 1_000,
    endAtMs: 2_000,
    createdAtMs: 2_000,
  }

  try {
    await mkdir(path.join(home, ".omp", "project-time"), { recursive: true })
    await writeFile(
      path.join(home, ".omp", "project-time", "time-log.json"),
      JSON.stringify({ entries: [entry] }),
    )

    // Act
    const { stderr, stdout } = await execFile(
      process.execPath,
      ["--import", "tsx", "src/project-time-cli.ts", "entries", "--project", "wrap"],
      { cwd: process.cwd(), env: { ...process.env, HOME: home } },
    )

    // Assert
    assert.doesNotMatch(stderr, /Project Time command error/)
    assert.deepEqual(JSON.parse(stdout), {
      format: "omp-project-time/evidence",
      version: 1,
      entries: [entry],
    })
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})

test("when inspecting an exact project, then direct-binary statistics keep source totals separate", async () => {
  // Arrange
  const home = await mkdtemp(path.join(tmpdir(), "project-time-cli-"))
  const entries = [
    {
      id: "wrap-human",
      sourceKind: "human_active",
      project: "wrap",
      repositoryId: "wrap-repository",
      startAtMs: 1_000,
      endAtMs: 3_000,
      createdAtMs: 3_000,
    },
    {
      id: "wrap-agent",
      sourceKind: "agent_turn_elapsed",
      project: "wrap",
      repositoryId: "wrap-repository",
      startAtMs: 3_000,
      endAtMs: 4_000,
      createdAtMs: 4_000,
    },
    {
      id: "other-human",
      sourceKind: "human_active",
      project: "other",
      repositoryId: "other-repository",
      startAtMs: 4_000,
      endAtMs: 8_000,
      createdAtMs: 8_000,
    },
  ]

  try {
    await mkdir(path.join(home, ".omp", "project-time"), { recursive: true })
    await writeFile(
      path.join(home, ".omp", "project-time", "time-log.json"),
      JSON.stringify({ entries }),
    )

    // Act
    const { stdout } = await runCli(home, "stats", "--project", "wrap")

    // Assert
    assert.deepEqual(JSON.parse(stdout), {
      format: "omp-project-time/statistics",
      version: 1,
      entryCount: 2,
      sources: {
        humanActive: { entryCount: 1, observedMilliseconds: 2_000 },
        agentTurnElapsed: { entryCount: 1, observedMilliseconds: 1_000 },
      },
      firstStartAtMs: 1_000,
      lastEndAtMs: 4_000,
      projects: [
        {
          project: "wrap",
          entryCount: 2,
          sources: {
            humanActive: { entryCount: 1, observedMilliseconds: 2_000 },
            agentTurnElapsed: { entryCount: 1, observedMilliseconds: 1_000 },
          },
          firstStartAtMs: 1_000,
          lastEndAtMs: 4_000,
        },
      ],
    })
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})

test("when pruning before a local day, then dry run keeps all entries and prune preserves crossing intervals", async () => {
  // Arrange
  const home = await mkdtemp(path.join(tmpdir(), "project-time-cli-"))
  const cutoffAtMs = new Date(2026, 0, 2).getTime()
  const entries = [
    {
      id: "old",
      sourceKind: "human_active",
      project: "wrap",
      repositoryId: "wrap-repository",
      startAtMs: cutoffAtMs - 2 * 60_000,
      endAtMs: cutoffAtMs,
      createdAtMs: cutoffAtMs,
    },
    {
      id: "crossing",
      sourceKind: "human_active",
      project: "wrap",
      repositoryId: "wrap-repository",
      startAtMs: cutoffAtMs - 60_000,
      endAtMs: cutoffAtMs + 60_000,
      createdAtMs: cutoffAtMs + 60_000,
    },
    {
      id: "recent",
      sourceKind: "agent_turn_elapsed",
      project: "other",
      repositoryId: "other-repository",
      startAtMs: cutoffAtMs + 60_000,
      endAtMs: cutoffAtMs + 2 * 60_000,
      createdAtMs: cutoffAtMs + 2 * 60_000,
    },
  ]
  const legacyContent = JSON.stringify({ entries })

  try {
    await mkdir(path.join(home, ".omp", "project-time"), { recursive: true })
    await writeFile(
      path.join(home, ".omp", "project-time", "time-log.json"),
      legacyContent,
    )

    // Act
    const dryRun = await runCli(
      home,
      "prune",
      "--before",
      "2026-01-02",
      "--dry-run",
    )

    // Assert
    assert.deepEqual(JSON.parse(dryRun.stdout), {
      format: "omp-project-time/prune",
      version: 1,
      before: "2026-01-02",
      dryRun: true,
      matchingEntryCount: 1,
      deletedEntryCount: 0,
      retainedEntryCount: 3,
    })
    assert.equal(
      await readFile(
        path.join(home, ".omp", "project-time", "time-log.json"),
        "utf8",
      ),
      legacyContent,
    )

    // Act
    const prune = await runCli(home, "prune", "--before", "2026-01-02")

    // Assert
    assert.deepEqual(JSON.parse(prune.stdout), {
      format: "omp-project-time/prune",
      version: 1,
      before: "2026-01-02",
      dryRun: false,
      matchingEntryCount: 1,
      deletedEntryCount: 1,
      retainedEntryCount: 2,
    })

    const exported = await runCli(home, "entries")
    assert.deepEqual(
      JSON.parse(exported.stdout).entries.map(
        (entry: { id: string }) => entry.id,
      ),
      ["crossing", "recent"],
    )
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})
