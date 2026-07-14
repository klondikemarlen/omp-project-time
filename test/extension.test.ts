import assert from "node:assert/strict"
import { execFile } from "node:child_process"
import { randomUUID } from "node:crypto"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { promisify } from "node:util"
import { mock, test } from "node:test"

import {
  emptyDeveloperCostState,
  parseDeveloperCostConfig,
  parseDeveloperCostState,
  type DeveloperCostState,
} from "../src/billing/index.js"
import { SpreadBillingLedger } from "../src/billing/infrastructure/spread-ledger.js"
import { descriptionInputFromSession } from "../src/billable-time/domain/description-context.js"
import type { ConfigLoader } from "../src/extension/types.js"
import { ProjectTimeRuntime } from "../src/extension/runtime.js"
import { DEVELOPER_COST_STATE_ENTRY } from "../src/extension/session-state.js"
import projectTimeExtension, { type ExtensionApi } from "../src/index.js"
import { TimeLogLedger } from "../src/time-log/infrastructure/ledger.js"
import { resolveGitRepository } from "../src/time-log/infrastructure/git-repository.js"

const execFileAsync = promisify(execFile)

type RegisteredHandler = (event: never, ctx: never) => Promise<void>
type RegisteredCommand = {
  handler: (args: string, ctx: never) => Promise<void>
  getArgumentCompletions?: (argumentPrefix: string) => Array<{
    value: string
    label: string
    description?: string
  }> | null
}
type Runtime = {
  commands: Map<string, RegisteredCommand>
  entries: Array<{ type: "custom"; customType: string; data?: unknown }>
  handlers: Map<string, RegisteredHandler>
  notifications: Array<{ message: string; type?: "info" | "warning" | "error" }>
  statusText?: string
}

test("persists one attention count for a top-level prompt", async () => {
  const start = Date.UTC(2026, 0, 1, 12, 0, 0)
  const runtime = createExtensionRuntime()
  const ctx = createContext(runtime, { parentSession: undefined })
  mock.method(Date, "now", () => start)

  try {
    await runtime.handlers.get("before_agent_start")?.({ prompt: "hello" } as never, ctx as never)

    assert.deepEqual(runtime.entries, [
      {
        type: "custom",
        customType: DEVELOPER_COST_STATE_ENTRY,
        data: {
          totalCost: "0",
          promptCount: 1,
          activeMilliseconds: 0,
          activeStartAtMs: start,
          activeUntilMs: start + 5 * 60 * 1000,
          lastSettledAtMs: start,
          lastPromptAtMs: start,
        },
      },
    ])
    assert.equal(runtime.statusText, "dim:$0.00 (dev)")
  } finally {
    mock.restoreAll()
  }
})

test("offers documented Project Time commands and rejects unsupported arguments", async () => {
  const runtime = createExtensionRuntime()
  const command = runtime.commands.get("project-time")
  assert.ok(command)

  assert.deepEqual(command.getArgumentCompletions?.(""), [
    {
      value: "summary",
      label: "summary",
      description: "Show session cost, active time, and prompt count",
    },
    {
      value: "billable",
      label: "billable",
      description: "Show locally recorded billable clocks",
    },
    {
      value: "billable preview",
      label: "billable preview",
      description: "Preview provider-neutral billable entries",
    },
  ])
  assert.deepEqual(command.getArgumentCompletions?.("billable "), [
    {
      value: "billable preview",
      label: "billable preview",
      description: "Preview provider-neutral billable entries",
    },
  ])

  await command.handler("unknown", createContext(runtime, { parentSession: undefined }) as never)
  assert.deepEqual(runtime.notifications, [{
    message: "Unknown Project Time command. Use summary, billable, or billable preview.",
    type: "error",
  }])
})

test("shows the active Git project in the default Project Time dashboard", async () => {
  await withGitRepository("https://github.com/Acme/Project.git", async (cwd) => {
    const runtime = createExtensionRuntime()
    const context = createContext(runtime, { cwd, parentSession: undefined })

    await runtime.commands.get("project-time")?.handler("", context as never)

    assert.deepEqual(runtime.notifications.at(-1), {
      message: [
        "Project Time",
        "Project: Project",
        "Developer meter: $0.00 (dev)",
        "Billable policies: not configured",
        "Commands: /project-time summary | /project-time billable | /project-time billable preview",
        "Tip: type /project-time followed by a space to choose a mode.",
      ].join("\n"),
      type: "info",
    })
  })
})

test("uses the current repository as the default billable project target", async () => {
  const start = Date.UTC(2026, 0, 1, 12, 0, 0)
  const defaultConfig = async () => parseDeveloperCostConfig({
    billableTime: {
      defaultClient: "acme",
      clients: {
        acme: {
          label: "Acme",
          currency: "USD",
          attentionRatePerHour: "120",
          aiRatePerHour: "30",
        },
      },
      projects: {
        "github.com/acme/project": "Project Billing",
      },
    },
  })

  await withGitRepository("https://github.com/Acme/Project.git", async (cwd) => {
    const billableTimePath = path.join(cwd, "billable")
    const runtime = createExtensionRuntime({ billableTimePath, loadConfig: defaultConfig })
    const context = createContext(runtime, { cwd, parentSession: undefined })
    mock.method(Date, "now", () => start)

    try {
      await runtime.handlers.get("before_agent_start")?.({ prompt: "bill current project" } as never, context as never)
      await runtime.handlers.get("turn_end")?.({ type: "turn_end" } as never, context as never)

      const attention = JSON.parse(await readFile(path.join(billableTimePath, "attention-tokens.ndjson"), "utf8"))
      assert.equal(attention.repository, "github.com/acme/project")
      assert.equal(attention.projectId, "github.com/acme/project")
      assert.equal(attention.projectName, "Project Billing")

      await runtime.commands.get("project-time")?.handler("", context as never)
      assert.deepEqual(runtime.notifications.at(-1), {
        message: [
          "Project Time",
          "Project: Project",
          "Developer meter: $0.00 (dev)",
          "Billable policies: configured",
          "Commands: /project-time summary | /project-time billable | /project-time billable preview",
          "Tip: type /project-time followed by a space to choose a mode.",
        ].join("\n"),
        type: "info",
      })

      await runtime.commands.get("project-time")?.handler("billable preview", context as never)
      const preview = JSON.parse(runtime.notifications.at(-1)?.message ?? "[]")
      assert.deepEqual(
        preview.map((entry: { project_id: string; project_name: string }) => ({
          projectId: entry.project_id,
          projectName: entry.project_name,
        })),
        [
          { projectId: "github.com/acme/project", projectName: "Project Billing" },
          { projectId: "github.com/acme/project", projectName: "Project Billing" },
        ],
      )
    } finally {
      mock.restoreAll()
    }
  })
})

test("records billable clocks only for mapped top-level sessions", async () => {
  const start = Date.UTC(2026, 0, 1, 12, 0, 0)
  let nowMs = start

  await withGitRepository("https://github.com/Acme/Project.git", async (cwd) => {
    const billableTimePath = path.join(cwd, "billable")
    const runtime = createExtensionRuntime({ billableTimePath, loadConfig: loadBillableRateConfig })
    const topLevelContext = createContext(runtime, { cwd, parentSession: undefined })
    const childContext = createContext(runtime, { cwd, parentSession: "/tmp/parent.jsonl", sessionId: "child" })
    mock.method(Date, "now", () => nowMs)

    try {
      await runtime.handlers.get("before_agent_start")?.({ prompt: "top secret prompt" } as never, topLevelContext as never)
      nowMs += 1_000
      await runtime.handlers.get("turn_end")?.({ type: "turn_end" } as never, topLevelContext as never)
      await runtime.handlers.get("before_agent_start")?.({ prompt: "child prompt" } as never, childContext as never)
      nowMs += 60_000
      await runtime.handlers.get("turn_end")?.({ type: "turn_end" } as never, childContext as never)

      const attention = JSON.parse(await readFile(path.join(billableTimePath, "attention-tokens.ndjson"), "utf8"))
      const interval = JSON.parse(await readFile(path.join(billableTimePath, "ai-intervals.ndjson"), "utf8"))

      assert.equal(attention.durationMs, 300_000)
      assert.equal(interval.durationMs, 1_000)
      assert.doesNotMatch(JSON.stringify({ attention, interval }), /top secret prompt|child prompt/)
      await runtime.commands.get("project-time")?.handler("billable", topLevelContext as never)
      assert.deepEqual(runtime.notifications.at(-1), {
        message: "Acme: attention 1 units, 300000ms @ 120 USD/h = 10.00 USD\nAcme: ai 1 units, 1000ms @ 30 USD/h = 0.01 USD",
        type: "info",
      })
    } finally {
      mock.restoreAll()
    }
  })
})

test("stores local billable descriptions and previews provider-neutral entries", async () => {
  const startedAtMs = Date.UTC(2026, 0, 1, 12, 0, 0)
  let nowMs = startedAtMs

  await withGitRepository("https://github.com/Acme/Project.git", async (cwd) => {
    const billableTimePath = path.join(cwd, "billable")
    const runtime = createExtensionRuntime({ billableTimePath, loadConfig: loadBillableRateConfig })
    const context = createContext(runtime, { cwd, parentSession: undefined })
    mock.method(Date, "now", () => nowMs)

    try {
      await runtime.handlers.get("before_agent_start")?.({ prompt: "top secret prompt" } as never, context as never)
      nowMs += 1_000
      await runtime.handlers.get("turn_end")?.({ type: "turn_end" } as never, context as never)
      await runtime.handlers.get("session_compact")?.({
        compactionEntry: { summary: "Implement notification suppression" },
      } as never, context as never)

      const descriptionPath = path.join(billableTimePath, "session-descriptions.ndjson")
      const descriptions = (await readFile(descriptionPath, "utf8")).trim().split("\n").map((line) => JSON.parse(line))
      assert.deepEqual(descriptions.map((description) => description.description), [
        "Unlabeled billable work",
        "Unlabeled billable work",
      ])

      await runtime.commands.get("project-time")?.handler("billable preview", context as never)
      const preview = JSON.parse(runtime.notifications.at(-1)?.message ?? "")
      assert.deepEqual(preview.map((entry: { source_kind: string }) => entry.source_kind), ["attention", "ai"])
      assert.doesNotMatch(JSON.stringify(preview), /top secret prompt/)

      nowMs += 1_000
      await runtime.handlers.get("session_shutdown")?.({ type: "session_shutdown" } as never, context as never)

      const refreshedDescriptions = (await readFile(descriptionPath, "utf8"))
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line))
      assert.equal(refreshedDescriptions.length, 3)
    } finally {
      mock.restoreAll()
    }
  })
})

test("describes only the active session branch", async () => {
  const startedAtMs = Date.UTC(2026, 0, 1, 12, 0, 0)
  let nowMs = startedAtMs

  await withGitRepository("https://github.com/Acme/Project.git", async (cwd) => {
    const billableTimePath = path.join(cwd, "billable")
    let generatedInput = ""
    const runtime = createExtensionRuntime({
      billableTimePath,
      loadConfig: loadBillableRateConfig,
      generateTitle: async (input) => {
        generatedInput = input
        return "Active project task"
      },
    })
    const activeBranch = [{
      type: "message",
      message: { role: "user", content: "Implement active project task" },
    }] as never as Runtime["entries"]
    const allHistory = [
      { type: "message", message: { role: "user", content: "Abandoned historical task" } },
      ...activeBranch,
    ] as never as Runtime["entries"]
    const branchInput = descriptionInputFromSession(activeBranch as never)
    const historyInput = descriptionInputFromSession(allHistory as never)
    assert.match(branchInput, /Implement active project task/)
    assert.doesNotMatch(branchInput, /Abandoned historical task/)
    assert.match(historyInput, /Abandoned historical task/)
    let branchRead = false
    const context = createContext(runtime, {
      cwd,
      parentSession: undefined,
      branchEntries: activeBranch,
      allEntries: allHistory,
      onBranchRead() {
        branchRead = true
      },
    })
    mock.method(Date, "now", () => nowMs)

    try {
      await runtime.handlers.get("before_agent_start")?.({ prompt: "prompt" } as never, context as never)
      nowMs += 1_000
      await runtime.handlers.get("turn_end")?.({ type: "turn_end" } as never, context as never)

      assert.equal(branchRead, true)
      assert.match(generatedInput, /Implement active project task/)
      assert.doesNotMatch(generatedInput, /Abandoned historical task/)
      const description = await readFile(path.join(billableTimePath, "session-descriptions.ndjson"), "utf8")
      assert.match(description, /Active project task/)
      assert.doesNotMatch(description, /Abandoned historical task/)
    } finally {
      mock.restoreAll()
    }
  })
})

test("falls back to session history when branches are unavailable", async () => {
  const startedAtMs = Date.UTC(2026, 0, 1, 12, 0, 0)
  let nowMs = startedAtMs

  await withGitRepository("https://github.com/Acme/Project.git", async (cwd) => {
    const billableTimePath = path.join(cwd, "billable")
    const runtime = createExtensionRuntime({ billableTimePath, loadConfig: loadBillableRateConfig })
    const context = createContext(runtime, { cwd, parentSession: undefined })
    delete (context.sessionManager as { getBranch?: unknown }).getBranch
    mock.method(Date, "now", () => nowMs)

    try {
      await runtime.handlers.get("before_agent_start")?.({ prompt: "prompt" } as never, context as never)
      nowMs += 1_000
      await runtime.handlers.get("turn_end")?.({ type: "turn_end" } as never, context as never)

      const description = await readFile(path.join(billableTimePath, "session-descriptions.ndjson"), "utf8")
      assert.match(description, /Unlabeled billable work/)
      assert.doesNotMatch(JSON.stringify(runtime.notifications), /Billable time error/)
    } finally {
      mock.restoreAll()
    }
  })
})

test("describes a superseded mapped interval before an unmapped prompt", async () => {
  const startedAtMs = Date.UTC(2026, 0, 1, 12, 0, 0)
  let nowMs = startedAtMs

  await withGitRepository("https://github.com/Acme/Project.git", async (cwd) => {
    const billableTimePath = path.join(cwd, "billable")
    const runtime = createExtensionRuntime({ billableTimePath, loadConfig: loadBillableRateConfig })
    const mappedContext = createContext(runtime, { cwd, parentSession: undefined })
    const unmappedContext = createContext(runtime, {
      cwd: path.join(tmpdir(), "billable-time-unmapped"),
      parentSession: undefined,
    })
    mock.method(Date, "now", () => nowMs)

    try {
      await runtime.handlers.get("before_agent_start")?.({ prompt: "mapped prompt" } as never, mappedContext as never)
      nowMs += 1_000
      await runtime.handlers.get("before_agent_start")?.({ prompt: "unmapped prompt" } as never, unmappedContext as never)

      const descriptions = (await readFile(
        path.join(billableTimePath, "session-descriptions.ndjson"),
        "utf8",
      )).trim().split("\n").map((line) => JSON.parse(line))
      assert.equal(descriptions.length, 1)
      assert.equal(descriptions[0].source, "generated")
    } finally {
      mock.restoreAll()
    }
  })
})

test("converts configured refresh seconds to milliseconds", () => {
  const runtime = ProjectTimeRuntime as unknown as {
    refreshIntervalMs(config: { refreshIntervalSeconds: number }): number
  }

  assert.equal(runtime.refreshIntervalMs({ refreshIntervalSeconds: 3 }), 3_000)
})

test("feature scenario tracks visible developer cost across prompts and idle time", async () => {
  const start = Date.UTC(2026, 0, 1, 12, 0, 0)
  let nowMs = start
  const runtime = createExtensionRuntime({
    loadConfig: async () =>
      parseDeveloperCostConfig({
        monthlySalary: 100_000 / 12,
        hoursPerWeek: 35,
        weeksPerYear: 52,
        activeWindowMinutes: 5,
        refreshIntervalSeconds: 60,
      }),
  })
  const ctx = createContext(runtime, { parentSession: undefined })
  mock.method(Date, "now", () => nowMs)
  const setNow = (nextNowMs: number) => {
    nowMs = nextNowMs
  }

  try {
    setNow(start)
    await runtime.handlers.get("before_agent_start")?.({ prompt: "first prompt" } as never, ctx as never)
    assert.equal(runtime.statusText, "dim:$0.00 (dev)")

    setNow(start + 2 * 60 * 1000)
    await runtime.handlers.get("turn_end")?.({ type: "turn_end" } as never, ctx as never)
    assert.equal(runtime.statusText, "dim:$1.83 (dev)")

    setNow(start + 4 * 60 * 1000)
    await runtime.handlers.get("before_agent_start")?.({ prompt: "follow-up prompt" } as never, ctx as never)
    assert.equal(runtime.statusText, "dim:$3.66 (dev)")

    setNow(start + 9 * 60 * 1000)
    await runtime.handlers.get("turn_end")?.({ type: "turn_end" } as never, ctx as never)
    assert.equal(runtime.statusText, "dim:$8.24 (dev)")

    setNow(start + 10 * 60 * 1000)
    await runtime.commands.get("project-time")?.handler("", ctx as never)
    assert.deepEqual(runtime.notifications.at(-1), {
      message: [
        "Project Time",
        "Project: unavailable",
        "Developer meter: $8.24 (dev)",
        "Billable policies: not configured",
        "Commands: /project-time summary | /project-time billable | /project-time billable preview",
        "Tip: type /project-time followed by a space to choose a mode.",
      ].join("\n"),
      type: "info",
    })
  } finally {
    mock.restoreAll()
  }
})

test("reports a detailed attention summary without changing the compact status", async () => {
  const start = Date.UTC(2026, 0, 1, 12, 0, 0)
  let nowMs = start
  const runtime = createExtensionRuntime({
    loadConfig: async () =>
      parseDeveloperCostConfig({
        monthlySalary: 100_000 / 12,
        hoursPerWeek: 35,
        weeksPerYear: 52,
        activeWindowMinutes: 5,
        refreshIntervalSeconds: 60,
      }),
  })
  const ctx = createContext(runtime, { parentSession: undefined })
  mock.method(Date, "now", () => nowMs)

  try {
    await runtime.handlers.get("before_agent_start")?.({ prompt: "first prompt" } as never, ctx as never)

    nowMs = start + 2 * 60 * 1000
    await runtime.commands.get("project-time")?.handler("summary", ctx as never)

    assert.deepEqual(runtime.notifications, [
      {
        message:
          "Project Time summary\nSession: session-1\nCost: $1.83 (dev)\nActive time: 2m 0s\nPrompt count: 1\nLast prompt: 2m 0s ago (2026-01-01T12:00:00.000Z)",
        type: "info",
      },
    ])
    assert.equal(runtime.statusText, "dim:$0.00 (dev)")
  } finally {
    mock.restoreAll()
  }
})

test("records Git repository attention time without a manual command", async () => {
  const start = Date.UTC(2026, 0, 1)
  await withGitRepository("https://token@github.com/acme/attention.git", async (cwd) => {
    const timeLogPath = temporaryLedgerPath()
    const runtime = createExtensionRuntime({ timeLogPath })
    const ctx = createContext(runtime, { cwd, parentSession: undefined })
    let nowMs = start
    mock.method(Date, "now", () => nowMs)

    try {
      assert.equal(runtime.commands.has("developer-time-log"), false)
      await runtime.handlers.get("before_agent_start")?.({ prompt: "start" } as never, ctx as never)

      const turnEndHandler = runtime.handlers.get("turn_end")
      const shutdownHandler = runtime.handlers.get("session_shutdown")
      assert.ok(turnEndHandler)
      assert.ok(shutdownHandler)
      nowMs = start + 60_000
      await turnEndHandler({ type: "turn_end" } as never, ctx as never)
      nowMs = start + 2 * 60_000
      await turnEndHandler({ type: "turn_end" } as never, ctx as never)
      await shutdownHandler({} as never, ctx as never)

      const entries = await new TimeLogLedger(timeLogPath).entries()
      assert.equal(JSON.stringify(entries).includes("token"), false)
      assert.deepEqual(
        entries.map(({ id: _id, createdAtMs: _createdAtMs, repositoryId, ...entry }) => ({
          ...entry,
          repositoryIdMatches: /^[a-f0-9]{64}$/.test(repositoryId),
        })),
        [
          {
            project: "attention",
            startAtMs: start,
            endAtMs: start + 2 * 60_000,
            repositoryIdMatches: true,
          },
        ],
      )
    } finally {
      mock.restoreAll()
    }
  })
})

test("records full overlapping repository intervals for simultaneous sessions", async () => {
  const start = Date.UTC(2026, 0, 1)
  await withGitRepository("https://github.com/acme/attention.git", async (cwd) => {
    const ledgerPath = temporaryLedgerPath()
    const timeLogPath = temporaryLedgerPath()
    const first = createExtensionRuntime({ ledgerPath, loadConfig: loadFullRateConfig, timeLogPath })
    const second = createExtensionRuntime({ ledgerPath, loadConfig: loadFullRateConfig, timeLogPath })
    const firstContext = createContext(first, { cwd, parentSession: undefined, sessionId: "first" })
    const secondContext = createContext(second, { cwd, parentSession: undefined, sessionId: "second" })
    let nowMs = start
    mock.method(Date, "now", () => nowMs)

    try {
      await first.handlers.get("before_agent_start")?.({ prompt: "first" } as never, firstContext as never)
      await second.handlers.get("before_agent_start")?.({ prompt: "second" } as never, secondContext as never)
      nowMs = start + 60_000
      await Promise.all([
        first.handlers.get("turn_end")?.({ type: "turn_end" } as never, firstContext as never),
        second.handlers.get("turn_end")?.({ type: "turn_end" } as never, secondContext as never),
      ])
      await Promise.all([
        first.handlers.get("session_shutdown")?.({} as never, firstContext as never),
        second.handlers.get("session_shutdown")?.({} as never, secondContext as never),
      ])

      assert.deepEqual(
        (await new TimeLogLedger(timeLogPath).entries()).map(
          ({ id: _id, createdAtMs: _createdAtMs, repositoryId: _repositoryId, ...entry }) => entry,
        ),
        [
          { project: "attention", startAtMs: start, endAtMs: start + 60_000 },
          { project: "attention", startAtMs: start, endAtMs: start + 60_000 },
        ],
      )
    } finally {
      mock.restoreAll()
    }
  })
})

test("uses a non-sensitive fallback identity for a Git repository without origin", async () => {
  const start = Date.UTC(2026, 0, 1)
  await withGitRepository(undefined, async (cwd) => {
    const repository = await resolveGitRepository(cwd)
    assert.ok(repository)
    assert.equal(repository.project, "local-repository")
    assert.match(repository.repositoryId, /^[a-f0-9]{64}$/)
    assert.equal(JSON.stringify(repository).includes(path.dirname(cwd)), false)

    const timeLogPath = temporaryLedgerPath()
    const runtime = createExtensionRuntime({ timeLogPath })
    const ctx = createContext(runtime, { cwd, parentSession: undefined })
    let nowMs = start
    mock.method(Date, "now", () => nowMs)

    try {
      await runtime.handlers.get("before_agent_start")?.({ prompt: "start" } as never, ctx as never)
      nowMs = start + 60_000
      await runtime.handlers.get("turn_end")?.({ type: "turn_end" } as never, ctx as never)
      await runtime.handlers.get("session_shutdown")?.({} as never, ctx as never)

      const entries = await new TimeLogLedger(timeLogPath).entries()
      assert.equal(entries[0]?.project, "local-repository")
      assert.equal(JSON.stringify(entries).includes(path.dirname(cwd)), false)
    } finally {
      mock.restoreAll()
    }
  })
})

test("sanitizes remote-derived project labels", async () => {
  await withGitRepository("git@github.com:acme/%2Fprivate.git", async (cwd) => {
    const repository = await resolveGitRepository(cwd)
    assert.ok(repository)
    assert.equal(repository.project, "2Fprivate")
    assert.equal(repository.project.includes("%"), false)
  })
})

test("retries repository resolution when the working directory becomes a Git repository", async () => {
  const start = Date.UTC(2026, 0, 1)
  const cwd = await mkdtemp(path.join(tmpdir(), "developer-cost-extension-test-"))
  const timeLogPath = temporaryLedgerPath()
  const runtime = createExtensionRuntime({ timeLogPath })
  const firstContext = createContext(runtime, {
    cwd,
    parentSession: undefined,
    sessionId: "first-session",
  })
  const secondContext = createContext(runtime, {
    allEntries: [],
    branchEntries: [],
    cwd,
    parentSession: undefined,
    sessionId: "second-session",
  })
  let nowMs = start
  mock.method(Date, "now", () => nowMs)

  try {
    await runtime.handlers.get("before_agent_start")?.({ prompt: "outside Git" } as never, firstContext as never)
    nowMs = start + 60_000
    await runtime.handlers.get("session_shutdown")?.({} as never, firstContext as never)

    await execFileAsync("git", ["init", cwd])
    await execFileAsync("git", ["-C", cwd, "remote", "add", "origin", "https://github.com/acme/attention.git"])
    nowMs = start + 2 * 60_000
    await runtime.handlers.get("before_agent_start")?.({ prompt: "inside Git" } as never, secondContext as never)
    nowMs = start + 3 * 60_000
    await runtime.handlers.get("session_shutdown")?.({} as never, secondContext as never)

    const entries = await new TimeLogLedger(timeLogPath).entries()
    assert.deepEqual(
      entries.map(({ id: _id, createdAtMs: _createdAtMs, repositoryId: _repositoryId, ...entry }) => entry),
      [{ project: "attention", startAtMs: start + 2 * 60_000, endAtMs: start + 3 * 60_000 }],
    )
  } finally {
    mock.restoreAll()
    await rm(cwd, { recursive: true, force: true })
    await rm(timeLogPath, { force: true })
  }
})

test("keeps billing active when automatic time-log persistence fails", async () => {
  const start = Date.UTC(2026, 0, 1)
  await withGitRepository("https://github.com/acme/attention.git", async (cwd) => {
    const timeLogPath = await mkdtemp(path.join(tmpdir(), "time-log-directory-"))
    const runtime = createExtensionRuntime({ timeLogPath })
    let notifyError: (() => void) | undefined
    const errorReported = new Promise<void>((resolve) => {
      notifyError = resolve
    })
    const ctx = createContext(runtime, {
      cwd,
      parentSession: undefined,
      onNotification: notifyError,
    })
    let nowMs = start
    mock.method(Date, "now", () => nowMs)

    try {
      const promptHandler = runtime.handlers.get("before_agent_start")
      const turnEndHandler = runtime.handlers.get("turn_end")
      assert.ok(promptHandler)
      assert.ok(turnEndHandler)
      await promptHandler({ prompt: "start" } as never, ctx as never)
      nowMs = start + 60_000
      await assert.doesNotReject(turnEndHandler({ type: "turn_end" } as never, ctx as never))
      await errorReported
      await rm(timeLogPath, { recursive: true, force: true })
      await runtime.handlers.get("session_shutdown")?.({} as never, ctx as never)

      assert.deepEqual(
        (await new TimeLogLedger(timeLogPath).entries()).map(
          ({ id: _id, createdAtMs: _createdAtMs, repositoryId, ...entry }) => ({
            ...entry,
            repositoryIdMatches: /^[a-f0-9]{64}$/.test(repositoryId),
          }),
        ),
        [{ project: "attention", startAtMs: start, endAtMs: start + 60_000, repositoryIdMatches: true }],
      )
    } finally {
      mock.restoreAll()
      await rm(timeLogPath, { recursive: true, force: true })
    }
  })
})

test("attributes a repository switch to each repository automatically", async () => {
  const start = Date.UTC(2026, 0, 1)
  await withGitRepository("git@github.com:acme/alpha.git", async (alphaCwd) => {
    await withGitRepository("https://github.com/acme/beta.git", async (betaCwd) => {
      const timeLogPath = temporaryLedgerPath()
      const runtime = createExtensionRuntime({ timeLogPath })
      const alphaContext = createContext(runtime, { cwd: alphaCwd, parentSession: undefined })
      const betaContext = createContext(runtime, { cwd: betaCwd, parentSession: undefined })
      let nowMs = start
      mock.method(Date, "now", () => nowMs)

      try {
        await runtime.handlers.get("before_agent_start")?.({ prompt: "alpha" } as never, alphaContext as never)
        nowMs = start + 60_000
        await runtime.handlers.get("before_agent_start")?.({ prompt: "beta" } as never, betaContext as never)
        nowMs = start + 2 * 60_000
        await runtime.handlers.get("turn_end")?.({ type: "turn_end" } as never, betaContext as never)
        await runtime.handlers.get("session_shutdown")?.({} as never, betaContext as never)

        const entries = await new TimeLogLedger(timeLogPath).entries()
        assert.deepEqual(
          entries.map(({ id: _id, createdAtMs: _createdAtMs, repositoryId: _repositoryId, ...entry }) => entry),
          [
            { project: "alpha", startAtMs: start, endAtMs: start + 60_000 },
            { project: "beta", startAtMs: start + 60_000, endAtMs: start + 2 * 60_000 },
          ],
        )
      } finally {
        mock.restoreAll()
      }
    })
  })
})

test("reports an unavailable last prompt for an unrenderable persisted timestamp", async () => {
  const runtime = createExtensionRuntime()
  const ctx = createContext(runtime, {
    parentSession: undefined,
    allEntries: [
      {
        type: "custom",
        customType: DEVELOPER_COST_STATE_ENTRY,
        data: {
          totalCost: "12.34",
          promptCount: 1,
          activeMilliseconds: 60_000,
          lastSettledAtMs: Date.UTC(2026, 0, 1, 12, 0, 0),
          lastPromptAtMs: 9e15,
        },
      },
    ],
  })

  await assert.doesNotReject(
    runtime.commands.get("project-time")!.handler("summary", ctx as never),
  )
  assert.deepEqual(runtime.notifications, [
    {
      message:
        "Project Time summary\nSession: session-1\nCost: $12.34 (dev)\nActive time: 1m 0s\nPrompt count: 1\nLast prompt: unavailable",
      type: "info",
    },
  ])
})

test("passes context cwd to the config loader", async () => {
  const loadedCwds: string[] = []
  const loadConfig: ConfigLoader = async (cwd) => {
    loadedCwds.push(cwd)

    return parseDeveloperCostConfig()
  }
  const runtime = createExtensionRuntime({ loadConfig })
  const ctx = createContext(runtime, { parentSession: undefined })

  await runtime.handlers.get("before_agent_start")?.({ prompt: "hello" } as never, ctx as never)

  assert.deepEqual(loadedCwds, [ctx.cwd])
})

test("restores persisted state from full session history", async () => {
  const runtime = createExtensionRuntime()
  const ctx = createContext(runtime, {
    parentSession: undefined,
    branchEntries: [],
    allEntries: [
      {
        type: "custom",
        customType: DEVELOPER_COST_STATE_ENTRY,
        data: { totalCost: "12.34" },
      },
    ],
  })

  await runtime.commands.get("project-time")?.handler("", ctx as never)

  assert.deepEqual(runtime.notifications, [
    {
      message: [
        "Project Time",
        "Project: unavailable",
        "Developer meter: $12.34 (dev)",
        "Billable policies: not configured",
        "Commands: /project-time summary | /project-time billable | /project-time billable preview",
        "Tip: type /project-time followed by a space to choose a mode.",
      ].join("\n"),
      type: "info",
    },
  ])
})

test("activates persisted state from full session history", async () => {
  const runtime = createExtensionRuntime()
  const now = Date.now()
  const ctx = createContext(runtime, {
    parentSession: undefined,
    branchEntries: [],
    allEntries: [
      {
        type: "custom",
        customType: DEVELOPER_COST_STATE_ENTRY,
        data: {
          totalCost: "12.34",
          activeStartAtMs: now,
          activeUntilMs: now + 60_000,
          lastSettledAtMs: now,
        },
      },
    ],
  })

  await runtime.handlers.get("session_start")?.({ reason: "start" } as never, ctx as never)

  assert.equal(runtime.statusText, "dim:$12.34 (dev)")
})

test("skips billing for child sessions without clearing parent prompt status", async () => {
  const runtime = createExtensionRuntime()
  const parentCtx = createContext(runtime, {
    parentSession: undefined,
    sessionId: "parent-session",
  })
  const childCtx = createContext(runtime, {
    parentSession: "/tmp/parent.jsonl",
    sessionId: "child-session",
  })

  await runtime.handlers.get("before_agent_start")?.(
    { prompt: "parent prompt" } as never,
    parentCtx as never,
  )
  await runtime.handlers.get("before_agent_start")?.(
    { prompt: "child prompt" } as never,
    childCtx as never,
  )

  assert.equal(runtime.entries.length, 1)
  assert.equal(runtime.statusText, "dim:$0.00 (dev)")
})

test("skips child session activation without clearing parent status", async () => {
  const runtime = createExtensionRuntime()
  const parentCtx = createContext(runtime, {
    parentSession: undefined,
    sessionId: "parent-session",
  })
  const childCtx = createContext(runtime, {
    parentSession: "/tmp/parent.jsonl",
    sessionId: "child-session",
  })

  await runtime.handlers.get("before_agent_start")?.(
    { prompt: "parent prompt" } as never,
    parentCtx as never,
  )
  await runtime.handlers.get("session_start")?.({ reason: "start" } as never, childCtx as never)

  assert.equal(runtime.entries.length, 1)
  assert.equal(runtime.statusText, "dim:$0.00 (dev)")
})

test("reports child sessions from the status command", async () => {
  const runtime = createExtensionRuntime()
  const ctx = createContext(runtime, { parentSession: "/tmp/parent.jsonl" })

  await runtime.commands.get("project-time")?.handler("", ctx as never)

  assert.deepEqual(runtime.notifications, [
    {
      message: "Project Time is only tracked for top-level sessions.",
      type: "info",
    },
  ])
})

test("shows snapshotted billable time when current config cannot load", async () => {
  const billableTimePath = await mkdtemp(path.join(tmpdir(), "billable-time-"))
  const attentionPath = path.join(billableTimePath, "attention-tokens.ndjson")

  try {
    await writeFile(attentionPath, `${JSON.stringify({
      emittedAtMs: 0,
      sessionId: "session",
      clientId: "icefog",
      clientLabel: "Icefog",
      repository: "github.com/icefoganalytics/wrap",
      sourceKind: "attention",
      durationMs: 300_000,
      ratePerHour: "120",
      currency: "CAD",
    })}\n`)
    const runtime = createExtensionRuntime({
      billableTimePath,
      loadConfig: async () => {
        throw new Error("broken config")
      },
    })
    const ctx = createContext(runtime, { parentSession: undefined })

    await runtime.commands.get("project-time")?.handler("billable", ctx as never)

    assert.deepEqual(runtime.notifications, [{
      message: "Icefog: attention 1 units, 300000ms @ 120 CAD/h = 10.00 CAD",
      type: "info",
    }])
  } finally {
    await rm(billableTimePath, { recursive: true, force: true })
  }
})

test("reports config errors from the status command", async () => {
  const runtime = createExtensionRuntime({
    loadConfig: async () => {
      throw new Error("broken config")
    },
  })
  const ctx = createContext(runtime, { parentSession: undefined })

  await runtime.commands.get("project-time")?.handler("", ctx as never)

  assert.deepEqual(runtime.notifications, [
    {
      message: "Project Time config error: broken config",
      type: "error",
    },
  ])
})

test("clears status and skips billing when prompt config load fails", async () => {
  const runtime = createExtensionRuntime({
    loadConfig: async () => {
      throw new Error("broken config")
    },
  })
  const ctx = createContext(runtime, { parentSession: undefined })
  runtime.statusText = "dim:$1.23 (dev)"

  await runtime.handlers.get("before_agent_start")?.({ prompt: "hello" } as never, ctx as never)

  assert.equal(runtime.entries.length, 0)
  assert.equal(runtime.statusText, undefined)
  assert.deepEqual(runtime.notifications, [
    {
      message: "Project Time config error: broken config",
      type: "error",
    },
  ])
})

test("clears status and skips turn-end persistence when config load fails", async () => {
  const runtime = createExtensionRuntime({
    loadConfig: async () => {
      throw new Error("broken config")
    },
  })
  const ctx = createContext(runtime, { parentSession: undefined })
  runtime.statusText = "dim:$1.23 (dev)"

  await runtime.handlers.get("turn_end")?.({ type: "turn_end" } as never, ctx as never)

  assert.equal(runtime.entries.length, 0)
  assert.equal(runtime.statusText, undefined)
  assert.deepEqual(runtime.notifications, [
    {
      message: "Project Time config error: broken config",
      type: "error",
    },
  ])
})

test("clears status when session activation config load fails", async () => {
  const runtime = createExtensionRuntime({
    loadConfig: async () => {
      throw new Error("broken config")
    },
  })
  const ctx = createContext(runtime, { parentSession: undefined })
  runtime.statusText = "dim:$1.23 (dev)"

  await runtime.handlers.get("session_start")?.({ reason: "start" } as never, ctx as never)

  assert.equal(runtime.entries.length, 0)
  assert.equal(runtime.statusText, undefined)
  assert.deepEqual(runtime.notifications, [
    {
      message: "Project Time config error: broken config",
      type: "error",
    },
  ])
})

test("clears status when session switch config load fails", async () => {
  const runtime = createExtensionRuntime({
    loadConfig: async () => {
      throw new Error("broken config")
    },
  })
  const ctx = createContext(runtime, { parentSession: undefined })
  runtime.statusText = "dim:$1.23 (dev)"

  await runtime.handlers.get("session_switch")?.({ reason: "switch" } as never, ctx as never)

  assert.equal(runtime.entries.length, 0)
  assert.equal(runtime.statusText, undefined)
  assert.deepEqual(runtime.notifications, [
    {
      message: "Project Time config error: broken config",
      type: "error",
    },
  ])
})

test("bills one top-level session at the full $120 hourly rate", async () => {
  const start = Date.UTC(2026, 0, 1, 12, 0, 0)
  let nowMs = start
  const runtime = createExtensionRuntime({ loadConfig: loadFullRateConfig })
  const ctx = createContext(runtime, { parentSession: undefined, sessionId: "single" })
  mock.method(Date, "now", () => nowMs)

  try {
    await runtime.handlers.get("before_agent_start")?.({ prompt: "hello" } as never, ctx as never)
    nowMs += 60_000
    await runtime.handlers.get("turn_end")?.({ type: "turn_end" } as never, ctx as never)

    assert.equal(latestState(runtime).totalCost.toString(), "2")
    assert.equal(latestState(runtime).activeMilliseconds, 60_000)
  } finally {
    mock.restoreAll()
  }
})

test("splits simultaneous session billing across runtimes sharing one ledger", async () => {
  const start = Date.UTC(2026, 0, 1, 12, 0, 0)
  let nowMs = start
  const ledgerPath = temporaryLedgerPath()
  const first = createExtensionRuntime({ ledgerPath, loadConfig: loadFullRateConfig })
  const second = createExtensionRuntime({ ledgerPath, loadConfig: loadFullRateConfig })
  const firstCtx = createContext(first, { parentSession: undefined, sessionId: "first" })
  const secondCtx = createContext(second, { parentSession: undefined, sessionId: "second" })
  mock.method(Date, "now", () => nowMs)

  try {
    await first.handlers.get("before_agent_start")?.({ prompt: "first" } as never, firstCtx as never)
    await second.handlers.get("before_agent_start")?.({ prompt: "second" } as never, secondCtx as never)
    nowMs += 60_000
    await first.handlers.get("turn_end")?.({ type: "turn_end" } as never, firstCtx as never)
    await second.handlers.get("turn_end")?.({ type: "turn_end" } as never, secondCtx as never)

    assert.equal(latestState(first).totalCost.toString(), "1")
    assert.equal(latestState(second).totalCost.toString(), "1")
    assert.equal(latestState(first).activeMilliseconds, 60_000)
    assert.equal(latestState(second).activeMilliseconds, 60_000)
  } finally {
    mock.restoreAll()
  }
})

test("splits only the staggered overlap across runtimes sharing one ledger", async () => {
  const start = Date.UTC(2026, 0, 1, 12, 0, 0)
  let nowMs = start
  const ledgerPath = temporaryLedgerPath()
  const first = createExtensionRuntime({ ledgerPath, loadConfig: loadFullRateConfig })
  const second = createExtensionRuntime({ ledgerPath, loadConfig: loadFullRateConfig })
  const firstCtx = createContext(first, { parentSession: undefined, sessionId: "first" })
  const secondCtx = createContext(second, { parentSession: undefined, sessionId: "second" })
  mock.method(Date, "now", () => nowMs)

  try {
    await first.handlers.get("before_agent_start")?.({ prompt: "first" } as never, firstCtx as never)
    nowMs += 60_000
    await second.handlers.get("before_agent_start")?.({ prompt: "second" } as never, secondCtx as never)
    nowMs += 60_000
    await first.handlers.get("turn_end")?.({ type: "turn_end" } as never, firstCtx as never)
    await second.handlers.get("turn_end")?.({ type: "turn_end" } as never, secondCtx as never)

    assert.equal(latestState(first).totalCost.toString(), "3")
    assert.equal(latestState(second).totalCost.toString(), "1")
    assert.equal(latestState(first).activeMilliseconds, 120_000)
    assert.equal(latestState(second).activeMilliseconds, 60_000)
  } finally {
    mock.restoreAll()
  }
})

test("expires a session after its five-minute active window", async () => {
  const start = Date.UTC(2026, 0, 1, 12, 0, 0)
  let nowMs = start
  const runtime = createExtensionRuntime({ loadConfig: loadFullRateConfig })
  const ctx = createContext(runtime, { parentSession: undefined, sessionId: "expired" })
  mock.method(Date, "now", () => nowMs)

  try {
    await runtime.handlers.get("before_agent_start")?.({ prompt: "hello" } as never, ctx as never)
    nowMs += 6 * 60_000
    await runtime.handlers.get("turn_end")?.({ type: "turn_end" } as never, ctx as never)

    assert.deepEqual({
      ...latestState(runtime),
      totalCost: latestState(runtime).totalCost.toString(),
    }, {
      totalCost: "10",
      promptCount: 1,
      activeMilliseconds: 5 * 60_000,
      activeStartAtMs: undefined,
      activeUntilMs: undefined,
      lastSettledAtMs: undefined,
      lastPromptAtMs: start,
    })
  } finally {
    mock.restoreAll()
  }
})

test("resumes stale persisted session state from its settled shared ledger entry", async () => {
  const start = Date.UTC(2026, 0, 1, 12, 0, 0)
  let nowMs = start
  const ledgerPath = temporaryLedgerPath()
  const first = createExtensionRuntime({ ledgerPath, loadConfig: loadFullRateConfig })
  const second = createExtensionRuntime({ ledgerPath, loadConfig: loadFullRateConfig })
  const firstCtx = createContext(first, { parentSession: undefined, sessionId: "first" })
  const secondCtx = createContext(second, { parentSession: undefined, sessionId: "second" })
  mock.method(Date, "now", () => nowMs)

  try {
    await first.handlers.get("before_agent_start")?.({ prompt: "first" } as never, firstCtx as never)
    await second.handlers.get("before_agent_start")?.({ prompt: "second" } as never, secondCtx as never)
    nowMs += 60_000
    await second.handlers.get("turn_end")?.({ type: "turn_end" } as never, secondCtx as never)

    const resumed = createExtensionRuntime({ ledgerPath, loadConfig: loadFullRateConfig })
    const resumedCtx = createContext(resumed, {
      parentSession: undefined,
      sessionId: "first",
      allEntries: first.entries,
    })
    await resumed.handlers.get("session_start")?.({ reason: "resume" } as never, resumedCtx as never)

    assert.equal(latestState(first).totalCost.toString(), "0")
    assert.equal(resumed.statusText, "dim:$1.00 (dev)")
  } finally {
    mock.restoreAll()
  }
})

test("does not bill a child runtime against a shared ledger", async () => {
  const start = Date.UTC(2026, 0, 1, 12, 0, 0)
  let nowMs = start
  const ledgerPath = temporaryLedgerPath()
  const parent = createExtensionRuntime({ ledgerPath, loadConfig: loadFullRateConfig })
  const child = createExtensionRuntime({ ledgerPath, loadConfig: loadFullRateConfig })
  const parentCtx = createContext(parent, { parentSession: undefined, sessionId: "parent" })
  const childCtx = createContext(child, {
    parentSession: "/tmp/parent.jsonl",
    sessionId: "child",
  })
  mock.method(Date, "now", () => nowMs)

  try {
    await parent.handlers.get("before_agent_start")?.({ prompt: "parent" } as never, parentCtx as never)
    await child.handlers.get("before_agent_start")?.({ prompt: "child" } as never, childCtx as never)
    nowMs += 60_000
    await parent.handlers.get("turn_end")?.({ type: "turn_end" } as never, parentCtx as never)

    assert.equal(latestState(parent).totalCost.toString(), "2")
    assert.equal(child.entries.length, 0)
    assert.equal(child.statusText, undefined)
  } finally {
    mock.restoreAll()
  }
})


test("starts a late prompt at the shared ledger settlement frontier", async () => {
  const ledger = new SpreadBillingLedger(temporaryLedgerPath())
  const config = await loadFullRateConfig()
  const first = await ledger.recordPrompt("first", emptyDeveloperCostState(), 0, config)

  await ledger.settle("first", first, 101, config)
  const late = await ledger.recordPrompt("late", emptyDeveloperCostState(), 100, config)
  const settledLate = await ledger.settle("late", late, 102, config)

  assert.equal(late.activeStartAtMs, 101)
  assert.equal(late.lastSettledAtMs, 101)
  assert.equal(late.lastPromptAtMs, 100)
  assert.equal(late.activeMilliseconds, 0)
  assert.equal(settledLate.activeMilliseconds, 1)
  assert.equal(settledLate.totalCost.toString(), "0.00001666666666666667")
})

test("does not bill restored active state before the ledger settlement frontier", async () => {
  const ledger = new SpreadBillingLedger(temporaryLedgerPath())
  const config = await loadFullRateConfig()
  const first = await ledger.recordPrompt("first", emptyDeveloperCostState(), 0, config)
  const settledFirst = await ledger.settle("first", first, 60_000, config)
  const restored = parseDeveloperCostState({
    totalCost: "0",
    promptCount: 1,
    activeMilliseconds: 0,
    activeStartAtMs: 0,
    activeUntilMs: 5 * 60_000,
    lastSettledAtMs: 0,
    lastPromptAtMs: 0,
  })
  assert.ok(restored)

  const settledRestored = await ledger.settle("restored", restored, 60_000, config)

  assert.equal(settledFirst.totalCost.toString(), "2")
  assert.equal(settledRestored.totalCost.toString(), "0")
  assert.equal(settledRestored.activeMilliseconds, 0)
  assert.equal(Number(settledFirst.totalCost) + Number(settledRestored.totalCost), 2)
})

test("preserves concurrent sessions in the shared ledger", async () => {
  const ledgerPath = temporaryLedgerPath()
  const firstLedger = new SpreadBillingLedger(ledgerPath)
  const secondLedger = new SpreadBillingLedger(ledgerPath)
  const config = await loadFullRateConfig()
  const [firstPrompt, secondPrompt] = await Promise.all([
    firstLedger.recordPrompt("first", emptyDeveloperCostState(), 0, config),
    secondLedger.recordPrompt("second", emptyDeveloperCostState(), 0, config),
  ])

  const [first, second] = await Promise.all([
    firstLedger.settle("first", firstPrompt, 60_000, config),
    secondLedger.settle("second", secondPrompt, 60_000, config),
  ])

  assert.equal(first.totalCost.toString(), "1")
  assert.equal(second.totalCost.toString(), "1")
})

test("keeps delayed same-session prompt timestamps monotonic in the shared ledger", async () => {
  const ledgerPath = temporaryLedgerPath()
  const firstLedger = new SpreadBillingLedger(ledgerPath)
  const delayedLedger = new SpreadBillingLedger(ledgerPath)
  const config = await loadFullRateConfig()

  await firstLedger.recordPrompt("session", emptyDeveloperCostState(), 100, config)
  const delayed = await delayedLedger.recordPrompt("session", emptyDeveloperCostState(), 0, config)

  assert.equal(delayed.lastPromptAtMs, 100)
})

type RuntimeOptions = {
  ledgerPath?: string
  billableTimePath?: string
  loadConfig?: ConfigLoader
  timeLogPath?: string
  generateTitle?: (input: string) => Promise<string | null>
}

function createExtensionRuntime(options: RuntimeOptions = {}): Runtime {
  const runtime: Runtime = {
    commands: new Map(),
    entries: [],
    handlers: new Map(),
    notifications: [],
  }
  const pi: ExtensionApi = {
    registerCommand(name, options) {
      runtime.commands.set(name, {
        handler: options.handler as RegisteredCommand["handler"],
        getArgumentCompletions: options.getArgumentCompletions,
      })
    },
    on(event, handler) {
      runtime.handlers.set(event, handler as RegisteredHandler)
    },
    appendEntry(customType, data) {
      runtime.entries.push({ type: "custom", customType, data })
    },
  }

  projectTimeExtension(pi, {
    ledgerPath: options.ledgerPath ?? temporaryLedgerPath(),
    loadConfig: options.loadConfig ?? (async () => parseDeveloperCostConfig()),
    timeLogPath: options.timeLogPath ?? temporaryLedgerPath(),
    billableTimePath: options.billableTimePath ?? temporaryLedgerPath(),
    generateTitle: options.generateTitle,
  })

  return runtime
}

function temporaryLedgerPath(): string {
  return path.join(tmpdir(), `developer-cost-extension-test-${randomUUID()}.json`)
}

async function withGitRepository(
  remoteUrl: string | undefined,
  check: (cwd: string) => Promise<void>,
): Promise<void> {
  const cwd = await mkdtemp(path.join(tmpdir(), "developer-cost-extension-test-"))

  try {
    await execFileAsync("git", ["init", cwd])
    if (remoteUrl !== undefined) {
      await execFileAsync("git", ["-C", cwd, "remote", "add", "origin", remoteUrl])
    }
    await check(cwd)
  } finally {
    await rm(cwd, { recursive: true, force: true })
  }
}


async function loadFullRateConfig() {
  return parseDeveloperCostConfig({
    monthlySalary: 20_800,
    hoursPerWeek: 40,
    weeksPerYear: 52,
    activeWindowMinutes: 5,
    refreshIntervalSeconds: 60,
  })
}

async function loadBillableRateConfig() {
  return parseDeveloperCostConfig({
    billableTime: {
      clients: {
        acme: {
          label: "Acme",
          currency: "USD",
          attentionRatePerHour: "120",
          aiRatePerHour: "30",
        },
      },
      repositories: {
        "github.com/acme/project": "acme",
      },
    },
  })
}

function latestState(runtime: Runtime): DeveloperCostState {
  const entry = runtime.entries.at(-1)
  assert.ok(entry)
  assert.equal(entry.customType, DEVELOPER_COST_STATE_ENTRY)
  const state = parseDeveloperCostState(entry.data)
  assert.ok(state)
  return state
}

function createContext(
  runtime: Runtime,
  options: {
    parentSession?: string
    branchEntries?: Runtime["entries"]
    allEntries?: Runtime["entries"]
    sessionId?: string
    cwd?: string
    onNotification?: () => void
    onBranchRead?: () => void
  },
) {
  return {
    cwd: options.cwd ?? path.join(tmpdir(), "developer-cost-extension-test"),
    sessionManager: {
      getSessionId() {
        return options.sessionId ?? "session-1"
      },
      getHeader() {
        return {
          parentSession: options.parentSession,
        }
      },
      getBranch() {
        options.onBranchRead?.()
        return options.branchEntries ?? runtime.entries
      },
      getEntries() {
        return options.allEntries ?? runtime.entries
      },
    },
    ui: {
      notify(message: string, type?: "info" | "warning" | "error") {
        runtime.notifications.push({ message, type })
        options.onNotification?.()
      },
      setStatus(_key: string, text: string | undefined) {
        runtime.statusText = text
      },
      theme: {
        fg(color: string, text: string) {
          return `${color}:${text}`
        },
      },
    },
  }
}
