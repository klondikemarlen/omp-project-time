import assert from "node:assert/strict"
import { execFile } from "node:child_process"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"
import { promisify } from "node:util"

import { ProjectTimeRuntime } from "../src/extension/runtime.js"
import { parseTimeLogState } from "../src/time-log/infrastructure/state-mapper.js"
import type { CommandHandler, ExtensionApi, ExtensionContext } from "../src/extension/types.js"

const execFileAsync = promisify(execFile)

test("starts and stops manual tracking through the Project Time command", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "project-time-manual-runtime-"))
  const timeLogPath = path.join(directory, "time-log.json")
  const notices: Array<{ message: string; type?: string }> = []
  const originalNow = Date.now
  let nowMs = Date.UTC(2026, 0, 1, 12)
  let handler: CommandHandler | undefined

  try {
    await execFileAsync("git", ["init", "--quiet", directory])
    Date.now = () => nowMs

    const extensionApi: ExtensionApi = {
      registerCommand(_name, options) {
        handler = options.handler
      },
      on() {},
      appendEntry() {},
    }
    const context: ExtensionContext = {
      cwd: directory,
      ui: {
        notify(message, type) {
          notices.push({ message, type })
        },
        setStatus() {},
        theme: { fg(_color, text) { return text } },
      },
      sessionManager: {
        getSessionId: () => "session",
        getHeader: () => null,
        getEntries: () => [],
      },
    }

    new ProjectTimeRuntime(extensionApi, { timeLogPath }).register()
    assert.ok(handler)

    await handler("start Client Review", context)
    nowMs += 60_000
    await handler("stop", context)

    assert.deepEqual(notices, [
      { message: "Manual tracking started for local-repository.", type: "info" },
      { message: "Manual tracking stopped for local-repository.", type: "info" },
    ])
    const state = parseTimeLogState(JSON.parse(await readFile(timeLogPath, "utf8")))
    assert.ok(state)
    assert.equal(state.activeManualTimer, undefined)
    assert.equal(state.entries.length, 1)
    const entry = state.entries[0]
    assert.ok(entry)
    assert.match(entry.id, /^auto-[a-f0-9]{64}$/)
    assert.match(entry.repositoryId, /^[a-f0-9]{64}$/)
    assert.deepEqual(
      {
        sourceKind: entry.sourceKind,
        project: entry.project,
        activity: entry.activity,
        startAtMs: entry.startAtMs,
        endAtMs: entry.endAtMs,
        createdAtMs: entry.createdAtMs,
        timeZone: entry.timeZone,
      },
      {
        sourceKind: "manual_tracked",
        project: "local-repository",
        activity: "Client Review",
        startAtMs: Date.UTC(2026, 0, 1, 12),
        endAtMs: Date.UTC(2026, 0, 1, 12) + 60_000,
        createdAtMs: Date.UTC(2026, 0, 1, 12) + 60_000,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      },
    )
  } finally {
    Date.now = originalNow
    await rm(directory, { recursive: true, force: true })
  }
})
