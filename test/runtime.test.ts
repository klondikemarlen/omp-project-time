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

test("reports raw attribution and rejects the removed independent mode", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "project-time-runtime-"))
  const notices: Array<{ message: string; type?: string }> = []
  let handler: CommandHandler | undefined
  let completionValues: string[] = []
  const extensionApi: ExtensionApi = {
    registerCommand(_name, options) {
      handler = options.handler
      completionValues = (options.getArgumentCompletions?.("") ?? []).map(({ value }) => value)
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

  try {
    new ProjectTimeRuntime(extensionApi, {
      timeLogPath: path.join(directory, "time-log.json"),
    }).register()
    assert.deepEqual(completionValues, ["summary", "history", "report"])
    assert.ok(handler)

    await handler("report human raw", context)
    assert.equal(notices.at(-1)?.type, "info")
    assert.equal(JSON.parse(notices.at(-1)?.message ?? "").mode, "raw")

    await handler("report human independent", context)
    assert.match(notices.at(-1)?.message ?? "", /Unknown report mode: independent/)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
