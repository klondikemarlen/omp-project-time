import assert from "node:assert/strict"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"

import { ProjectTimeRuntime } from "../src/extension/runtime.js"
import type {
  BeforeAgentStartHandler,
  CommandCompletion,
  CommandHandler,
  ExtensionApi,
  ExtensionContext,
} from "../src/extension/types.js"

test("shows concise reports and generates automatic activity labels", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "project-time-runtime-"))
  const notices: Array<{ message: string; type?: string }> = []
  const persistedActivities: unknown[] = []
  const persistedNarratives: unknown[] = []
  const persistedWorkItems: unknown[] = []
  const generatedPrompts: string[] = []
  const handlers: { beforeAgentStart?: BeforeAgentStartHandler } = {}
  let completionValues: string[] = []
  let argumentCompletions:
    | ((argumentPrefix: string) => CommandCompletion[] | null)
    | undefined
  let handler: CommandHandler | undefined
  const extensionApi: ExtensionApi = {
    registerCommand(_name, options) {
      handler = options.handler
      argumentCompletions = options.getArgumentCompletions
      completionValues = (argumentCompletions?.("") ?? []).map(({ value }) => value)
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
        persistedWorkItems.push("workItem" in data ? data.workItem : undefined)
      } else {
        persistedActivities.push(undefined)
        persistedNarratives.push(undefined)
        persistedWorkItems.push(undefined)
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
    assert.deepEqual(
      argumentCompletions?.("--p")?.map(({ value }) => value),
      ["--project"],
    )
    assert.deepEqual(
      argumentCompletions?.("summary ")?.map(({ value }) => value),
      ["summary --project"],
    )
    assert.deepEqual(
      argumentCompletions?.("report ")?.map(({ value }) => value),
      ["report --project"],
    )
    assert.deepEqual(
      argumentCompletions?.("summary --p")?.map(({ value }) => value),
      ["summary --project"],
    )
    assert.equal(argumentCompletions?.("garbage "), null)
    assert.equal(argumentCompletions?.("summary extra "), null)
    assert.equal(argumentCompletions?.("garbage --project "), null)
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

    await writeFile(
      path.join(directory, "time-log.json"),
      JSON.stringify({
        entries: [
          {
            id: "wrap-human",
            sourceKind: "human_active",
            project: "wrap",
            repositoryId: "wrap-repository",
            activity: "Code Review",
            startAtMs: 0,
            endAtMs: 60_000,
            createdAtMs: 60_000,
          },
          {
            id: "wrap-agent",
            sourceKind: "agent_turn_elapsed",
            project: "wrap",
            repositoryId: "wrap-repository",
            activity: "Tests",
            startAtMs: 60_000,
            endAtMs: 120_000,
            createdAtMs: 120_000,
          },
          {
            id: "other-human",
            sourceKind: "human_active",
            project: "other",
            repositoryId: "other-repository",
            activity: "Unrelated Work",
            startAtMs: 0,
            endAtMs: 180_000,
            createdAtMs: 180_000,
          },
        ],
      }),
    )

    assert.equal(argumentCompletions?.("history --project"), null)

    assert.deepEqual(
      argumentCompletions?.("history --project w")?.map(({ value }) => value),
      ["history --project wrap"],
    )

    await handler("--project wrap", context)
    assert.match(notices.at(-1)?.message ?? "", /Project: wrap · Ledger view/)
    assert.doesNotMatch(notices.at(-1)?.message ?? "", /Unrelated Work/)

    await handler("summary --project wrap", context)
    assert.match(notices.at(-1)?.message ?? "", /Project: wrap · Ledger summary/)
    assert.match(notices.at(-1)?.message ?? "", /Human active: 1m 0s/)

    await handler("history --project wrap", context)
    assert.match(notices.at(-1)?.message ?? "", /Current active: unavailable outside the active session/)
    assert.match(notices.at(-1)?.message ?? "", /Recent human active:\n- .*Code Review/)
    assert.doesNotMatch(notices.at(-1)?.message ?? "", /Unrelated Work/)

    await handler("report human raw --project wrap", context)
    assert.match(notices.at(-1)?.message ?? "", /- wrap: 1m 0s/)
    assert.doesNotMatch(notices.at(-1)?.message ?? "", /other/)

    await handler("report human split --project wrap", context)
    assert.match(notices.at(-1)?.message ?? "", /- wrap: 30s/)

    await handler(
      "report human weighted '{\"wrap-repository\": 3}' --project wrap",
      context,
    )
    assert.match(notices.at(-1)?.message ?? "", /- wrap: 45s/)

    await handler("report json --project wrap", context)
    assert.deepEqual(
      JSON.parse(notices.at(-1)?.message ?? "").human.raw.entries.map(
        (entry: { project: string }) => entry.project,
      ),
      ["wrap"],
    )

    await handler("report --project wrap --project other", context)
    assert.match(notices.at(-1)?.message ?? "", /Use --project NAME once at the end/)

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

    await handlers.beforeAgentStart({ prompt: "Continue the review without a reference." }, context)
    assert.deepEqual(persistedWorkItems.at(-1), {
      kind: "pull_request",
      number: 84,
      source: "user_provided",
    })

    await handlers.beforeAgentStart({ prompt: "Review PR #85." }, context)
    assert.deepEqual(persistedWorkItems.at(-1), {
      kind: "pull_request",
      number: 85,
      source: "user_provided",
    })

    await handlers.beforeAgentStart({ prompt: "Review PR #84 and PR #85." }, context)
    assert.deepEqual(persistedWorkItems.at(-1), {
      kind: "pull_request",
      number: 85,
      source: "user_provided",
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
