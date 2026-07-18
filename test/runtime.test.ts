import assert from "node:assert/strict"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"

import { ProjectTimeRuntime } from "../src/extension/runtime.js"
import type {
  BeforeAgentStartHandler,
  CommandHandler,
  ExtensionApi,
  ExtensionContext,
} from "../src/extension/types.js"

test("shows concise reports and generates automatic activity labels", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "project-time-runtime-"))
  const notices: Array<{ message: string; type?: string }> = []
  const persistedActivities: unknown[] = []
  const generatedPrompts: string[] = []
  const handlers: { beforeAgentStart?: BeforeAgentStartHandler } = {}
  let completionValues: string[] = []
  let handler: CommandHandler | undefined
  const extensionApi: ExtensionApi = {
    registerCommand(_name, options) {
      handler = options.handler
      completionValues = (options.getArgumentCompletions?.("") ?? []).map(({ value }) => value)
    },
    on(event, listener) {
      if (event === "before_agent_start") {
        // The event discriminator selects this ExtensionApi overload.
        const beforeAgentStartListener = listener as BeforeAgentStartHandler
        handlers.beforeAgentStart = beforeAgentStartListener
      }
    },
    appendEntry(_customType, data) {
      if (data !== null && typeof data === "object" && "activity" in data) {
        persistedActivities.push(data.activity)
      } else {
        persistedActivities.push(undefined)
      }
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
      generateActivity: async (prompt) => {
        generatedPrompts.push(prompt)
        if (prompt === "invalid output") return "Review #84"
        if (prompt === "generator failure") throw new Error("unavailable")
        return "Code Review"
      },
      timeLogPath: path.join(directory, "time-log.json"),
    }).register()
    assert.deepEqual(completionValues, ["summary", "history", "report"])
    assert.ok(handler)
    assert.ok(handlers.beforeAgentStart)

    await handler("", context)
    assert.match(notices.at(-1)?.message ?? "", /Session: Project Time Audit/)

    await handler("report", context)
    assert.equal(notices.at(-1)?.type, "info")
    assert.match(notices.at(-1)?.message ?? "", /Human collaboration — full repository time/)

    await handler("report json human raw", context)
    assert.equal(JSON.parse(notices.at(-1)?.message ?? "").mode, "raw")

    await handler("report all", context)
    assert.match(notices.at(-1)?.message ?? "", /Use report json for an all-modes report/)

    await handlers.beforeAgentStart({ prompt: "Review the pull request" }, context)
    assert.deepEqual(generatedPrompts, ["Review the pull request"])
    assert.equal(persistedActivities.at(-1), "Code Review")
    const persistedStateCount = persistedActivities.length
    await handlers.beforeAgentStart({ prompt: "same activity" }, context)
    assert.equal(persistedActivities.length, persistedStateCount + 1)
    assert.equal(persistedActivities.at(-1), "Code Review")

    await handlers.beforeAgentStart({ prompt: "invalid output" }, context)
    assert.equal(persistedActivities.at(-1), undefined)

    await handlers.beforeAgentStart({ prompt: "generator failure" }, context)
    assert.equal(persistedActivities.at(-1), undefined)

    await handler("activity Code Review", context)
    assert.match(
      notices.at(-1)?.message ?? "",
      /Unknown Project Time command. Use summary, history, or report/,
    )
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
