import assert from "node:assert/strict"
import { execFile as execFileCallback } from "node:child_process"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { promisify } from "node:util"
import test from "node:test"

const execFile = promisify(execFileCallback)

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
