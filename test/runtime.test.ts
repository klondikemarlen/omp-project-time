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
  const persistedNarratives: unknown[] = []
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
      if (data !== null && typeof data === "object") {
        persistedActivities.push("activity" in data ? data.activity : undefined)
        persistedNarratives.push("narrative" in data ? data.narrative : undefined)
      } else {
        persistedActivities.push(undefined)
        persistedNarratives.push(undefined)
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
        if (prompt === "initial failure") return {}
        if (prompt === "invalid output") return { activity: "Review #84" }
        if (prompt === "generator failure") throw new Error("unavailable")
        return {
          activity: "Code Review",
          narrative: {
            text: "Review PR #84, Capture activity narratives for downstream worklogs: verify typed persistence, legacy-log compatibility, and interval-duration access.",
            source: "generated",
          },
        }
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

    await handlers.beforeAgentStart({ prompt: "initial failure" }, context)
    assert.deepEqual(generatedPrompts, ["initial failure"])
    assert.equal(persistedActivities.at(-1), "General Work")

    await handlers.beforeAgentStart({
      prompt: "Review PR #84: Capture activity narratives for downstream worklogs, including typed persistence, legacy-log compatibility, and interval-duration access.",
    }, context)
    assert.deepEqual(generatedPrompts, [
      "initial failure",
      "Review PR #84: Capture activity narratives for downstream worklogs, including typed persistence, legacy-log compatibility, and interval-duration access.",
    ])
    assert.equal(persistedActivities.at(-1), "Code Review")
    assert.deepEqual(persistedNarratives.at(-1), {
      text: "Review PR #84, Capture activity narratives for downstream worklogs: verify typed persistence, legacy-log compatibility, and interval-duration access.",
      source: "generated",
    })
    const persistedStateCount = persistedActivities.length
    await handlers.beforeAgentStart({ prompt: "same activity" }, context)
    assert.equal(persistedActivities.length, persistedStateCount + 1)
    assert.equal(persistedActivities.at(-1), "Code Review")

    await handlers.beforeAgentStart({ prompt: "invalid output" }, context)
    assert.equal(persistedActivities.at(-1), "Code Review")

    await handlers.beforeAgentStart({ prompt: "generator failure" }, context)
    assert.equal(persistedActivities.at(-1), "Code Review")

    await handler("activity Code Review", context)
    assert.match(
      notices.at(-1)?.message ?? "",
      /Unknown Project Time command. Use summary, history, or report/,
    )
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
