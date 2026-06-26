import assert from "node:assert/strict"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"

import { parseDeveloperCostConfig } from "../src/billing/parse-developer-cost-config.js"
import type { ConfigLoader } from "../src/extension-types.js"
import developerCostStatusExtension, { type ExtensionApi } from "../src/index.js"
import { DEVELOPER_COST_STATE_ENTRY } from "../src/session-state.js"

type RegisteredHandler = (event: never, ctx: never) => Promise<void>
type RegisteredCommand = { handler: (args: string, ctx: never) => Promise<void> }
type Runtime = {
  commands: Map<string, RegisteredCommand>
  entries: Array<{ type: "custom"; customType: string; data?: unknown }>
  handlers: Map<string, RegisteredHandler>
  notifications: Array<{ message: string; type?: "info" | "warning" | "error" }>
  statusText?: string
}

test("records prompts and status for top-level sessions", async () => {
  const runtime = createExtensionRuntime()
  const ctx = createContext(runtime, { parentSession: undefined })

  await runtime.handlers.get("before_agent_start")?.({ prompt: "hello" } as never, ctx as never)

  assert.equal(runtime.entries.length, 1)
  assert.equal(runtime.entries[0]?.customType, DEVELOPER_COST_STATE_ENTRY)
  assert.equal(runtime.statusText, "dim:$0.00 (dev)")
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

  await runtime.commands.get("developer-cost-status")?.handler("", ctx as never)

  assert.deepEqual(runtime.notifications, [
    {
      message: "$12.34 (dev)",
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

  await runtime.commands.get("developer-cost-status")?.handler("", ctx as never)

  assert.deepEqual(runtime.notifications, [
    {
      message: "Developer cost status is only tracked for top-level sessions.",
      type: "info",
    },
  ])
})

test("reports config errors from the status command", async () => {
  const runtime = createExtensionRuntime({
    loadConfig: async () => {
      throw new Error("broken config")
    },
  })
  const ctx = createContext(runtime, { parentSession: undefined })

  await runtime.commands.get("developer-cost-status")?.handler("", ctx as never)

  assert.deepEqual(runtime.notifications, [
    {
      message: "Developer cost status config error: broken config",
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
      message: "Developer cost status config error: broken config",
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
      message: "Developer cost status config error: broken config",
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
      message: "Developer cost status config error: broken config",
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
      message: "Developer cost status config error: broken config",
      type: "error",
    },
  ])
})

type RuntimeOptions = {
  loadConfig?: ConfigLoader
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
      runtime.commands.set(name, { handler: options.handler as RegisteredCommand["handler"] })
    },
    on(event, handler) {
      runtime.handlers.set(event, handler as RegisteredHandler)
    },
    appendEntry(customType, data) {
      runtime.entries.push({ type: "custom", customType, data })
    },
  }

  developerCostStatusExtension(pi, {
    loadConfig: options.loadConfig ?? (async () => parseDeveloperCostConfig()),
  })

  return runtime
}

function createContext(
  runtime: Runtime,
  options: {
    parentSession?: string
    branchEntries?: Runtime["entries"]
    allEntries?: Runtime["entries"]
    sessionId?: string
  },
) {
  return {
    cwd: path.join(tmpdir(), "developer-cost-extension-test"),
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
        return options.branchEntries ?? runtime.entries
      },
      getEntries() {
        return options.allEntries ?? runtime.entries
      },
    },
    ui: {
      notify(message: string, type?: "info" | "warning" | "error") {
        runtime.notifications.push({ message, type })
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
