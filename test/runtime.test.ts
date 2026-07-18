import assert from "node:assert/strict"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"

import { ProjectTimeRuntime } from "../src/extension/runtime.js"
import type {
  CommandHandler,
  ExtensionApi,
  ExtensionContext,
} from "../src/extension/types.js"

test("shows concise reports and records explicit activity labels", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "project-time-runtime-"))
  const notices: Array<{ message: string; type?: string }> = []
  const persistedStates: unknown[] = []
  let completionValues: string[] = []
  let handler: CommandHandler | undefined
  const extensionApi: ExtensionApi = {
    registerCommand(_name, options) {
      handler = options.handler
      completionValues = (options.getArgumentCompletions?.("") ?? []).map(({ value }) => value)
    },
    on() {},
    appendEntry(_customType, data) {
      persistedStates.push(data)
    },
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
      getSessionName: () => "Project Time Audit",
      getHeader: () => null,
      getEntries: () => [],
    },
  }

  try {
    new ProjectTimeRuntime(extensionApi, {
      timeLogPath: path.join(directory, "time-log.json"),
    }).register()
    assert.deepEqual(completionValues, ["summary", "history", "activity", "report"])
    assert.ok(handler)

    await handler("", context)
    assert.match(notices.at(-1)?.message ?? "", /Session: Project Time Audit/)

    await handler("report", context)
    assert.equal(notices.at(-1)?.type, "info")
    assert.match(notices.at(-1)?.message ?? "", /Human collaboration — full repository time/)

    await handler("report json human raw", context)
    assert.equal(JSON.parse(notices.at(-1)?.message ?? "").mode, "raw")

    await handler("report all", context)
    assert.match(notices.at(-1)?.message ?? "", /Use report json for an all-modes report/)

    await handler("activity Code Review", context)
    assert.equal(notices.at(-1)?.message, "Activity: Code Review")
    assert.deepEqual(persistedStates.at(-1), {
      promptCount: 0,
      activeMilliseconds: 0,
      activity: "Code Review",
    })

    await handler("activity Review #84", context)
    assert.match(notices.at(-1)?.message ?? "", /Project Time activity error/)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
