import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { EventEmitter, once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";

import { parseProjectTimeConfig } from "../src/config/project-time-config.js";
import { ProjectTimeRuntime } from "../src/extension/runtime.js";
import type {
  ExtensionApi,
  ExtensionContext,
  ExtensionOptions,
} from "../src/extension/types.js";
import { GitContextResolver } from "../src/infrastructure/git-context.js";
import { TimeLogLedger } from "../src/time-log/infrastructure/ledger.js";
import { loadPersistedProjectTimeState } from "../src/extension/session-state.js";

async function createFixture(
  t: TestContext,
  gitContextResolver?: ExtensionOptions["gitContextResolver"],
) {
  const directory = await mkdtemp(
    path.join(tmpdir(), "project-time-context-run-"),
  );
  t.after(() => rm(directory, { recursive: true, force: true }));
  execFileSync("git", [
    "init",
    "--quiet",
    "--initial-branch=initial",
    directory,
  ]);
  const handlers = new Map<
    string,
    (event: never, ctx: ExtensionContext) => Promise<void>
  >();
  let currentSessionId = "context-session";
  const sessionEntries = new Map<
    string,
    Array<{ type: string; customType: string; data?: unknown }>
  >([[currentSessionId, []]]);
  const api: ExtensionApi = {
    registerCommand() {},
    appendEntry(customType, data) {
      sessionEntries
        .get(currentSessionId)
        ?.push({ type: "custom", customType, data });
    },
    on(name, handler) {
      handlers.set(name, handler);
    },
  };
  const ctx: ExtensionContext & { isIdle: () => boolean } = {
    // OMP emits terminal notifications before its in-flight prompt unwinds.
    isIdle: () => false,
    cwd: directory,
    sessionManager: {
      getSessionId: () => currentSessionId,
      getHeader: () => null,
      getEntries: () => sessionEntries.get(currentSessionId) ?? [],
    },
    ui: {
      notify(message, type) {
        if (type === "error") throw new Error(message);
      },
      setStatus() {},
      theme: { fg: (_color, text) => text },
    },
  };
  const databasePath = path.join(directory, "time-log.sqlite");
  new ProjectTimeRuntime(api, {
    timeLogPath: databasePath,
    loadConfig: async () =>
      parseProjectTimeConfig({ "Active Window Minutes": 1 }),
    generateActivity: async () => ({ activity: "Code Review" }),
    gitContextResolver,
  }).register();
  let nowMs = 1_000_000;
  t.mock.method(Date, "now", () => nowMs);
  return {
    directory,
    sessionEntries,
    selectSession(sessionId: string) {
      currentSessionId = sessionId;
      sessionEntries.set(sessionId, []);
    },
    ledger: new TimeLogLedger(databasePath),
    at(atMs: number) {
      nowMs = atMs;
    },
    async emit(name: string, prompt = "Continue the work.") {
      const handler = handlers.get(name);
      if (handler === undefined) throw new Error(`Missing handler: ${name}`);
      await handler({ type: name, prompt } as never, ctx);
    },
  };
}

test("when a branch changes during a run, both clocks retain separate immutable Git-context segments", async (t) => {
  // Arrange
  const fixture = await createFixture(t);

  // Act
  await fixture.emit("before_agent_start");
  await fixture.emit("agent_start");
  fixture.at(1_020_000);
  await fixture.emit("turn_end");
  execFileSync("git", [
    "-C",
    fixture.directory,
    "checkout",
    "--quiet",
    "-b",
    "APP-42/search",
  ]);
  fixture.at(1_040_000);
  await fixture.emit("turn_end");
  fixture.at(1_080_000);
  await fixture.emit("agent_end");
  await fixture.emit("session_shutdown");

  // Assert
  const entries = await fixture.ledger.entries();
  const observed = entries.map((entry) => ({
    sourceKind: entry.sourceKind,
    startAtMs: entry.startAtMs,
    endAtMs: entry.endAtMs,
    gitContext: { head: entry.gitContext?.head },
    ...(entry.workItem === undefined ? {} : { workItem: entry.workItem }),
    workItemAttribution: entry.workItemAttribution,
  }));
  assert.deepEqual(observed, [
    {
      sourceKind: "human_active",
      startAtMs: 1_000_000,
      endAtMs: 1_040_000,
      gitContext: {
        head: { kind: "branch", name: "initial", source: "active_branch" },
      },
      workItemAttribution: "unassigned",
    },
    {
      sourceKind: "agent_turn_elapsed",
      startAtMs: 1_000_000,
      endAtMs: 1_040_000,
      gitContext: {
        head: { kind: "branch", name: "initial", source: "active_branch" },
      },
      workItemAttribution: "unassigned",
    },
    {
      sourceKind: "agent_turn_elapsed",
      startAtMs: 1_040_000,
      endAtMs: 1_080_000,
      gitContext: {
        head: {
          kind: "branch",
          name: "APP-42/search",
          source: "active_branch",
        },
      },
      workItem: { kind: "jira", key: "APP-42", source: "active_branch" },
      workItemAttribution: "active_branch",
    },
    {
      sourceKind: "human_active",
      startAtMs: 1_040_000,
      endAtMs: 1_060_000,
      gitContext: {
        head: {
          kind: "branch",
          name: "APP-42/search",
          source: "active_branch",
        },
      },
      workItem: { kind: "jira", key: "APP-42", source: "active_branch" },
      workItemAttribution: "active_branch",
    },
  ]);
});

test("when an explicit ticket is followed by an unrelated branch, the old ticket is not carried across workstreams", async (t) => {
  // Arrange
  const fixture = await createFixture(t);

  // Act
  await fixture.emit("before_agent_start", "Review issue #134.");
  await fixture.emit("agent_start");
  fixture.at(1_010_000);
  await fixture.emit("agent_end");
  execFileSync("git", [
    "-C",
    fixture.directory,
    "checkout",
    "--quiet",
    "-b",
    "OPS-7/cleanup",
  ]);
  fixture.at(1_020_000);
  await fixture.emit("before_agent_start");
  await fixture.emit("agent_start");
  fixture.at(1_030_000);
  await fixture.emit("agent_end");
  await fixture.emit("session_shutdown");

  // Assert
  const entries = await fixture.ledger.entries();
  const agentEntries = entries.filter(
    (entry) => entry.sourceKind === "agent_turn_elapsed",
  );
  const observed = agentEntries.map((entry) => ({
    startAtMs: entry.startAtMs,
    endAtMs: entry.endAtMs,
    branch:
      entry.gitContext?.head.kind === "branch"
        ? entry.gitContext.head.name
        : null,
    workItem: entry.workItem,
    workItemAttribution: entry.workItemAttribution,
  }));
  assert.deepEqual(observed, [
    {
      startAtMs: 1_000_000,
      endAtMs: 1_010_000,
      branch: "initial",
      workItem: { kind: "issue", number: 134, source: "user_provided" },
      workItemAttribution: "explicit_prompt",
    },
    {
      startAtMs: 1_020_000,
      endAtMs: 1_030_000,
      branch: "OPS-7/cleanup",
      workItem: { kind: "jira", key: "OPS-7", source: "active_branch" },
      workItemAttribution: "active_branch",
    },
  ]);
});

test("when a prompt names a ticket on a Jira branch, explicit context wins over branch inference", async (t) => {
  // Arrange
  const fixture = await createFixture(t);
  execFileSync("git", [
    "-C",
    fixture.directory,
    "checkout",
    "--quiet",
    "-b",
    "OPS-7/cleanup",
  ]);

  // Act
  await fixture.emit("before_agent_start", "Review issue #134.");
  await fixture.emit("agent_start");
  fixture.at(1_010_000);
  await fixture.emit("agent_end");
  await fixture.emit("session_shutdown");

  // Assert
  const entries = await fixture.ledger.entries();
  const agentEntries = entries.filter(
    (entry) => entry.sourceKind === "agent_turn_elapsed",
  );
  const observed = agentEntries.map((entry) => ({
    branch:
      entry.gitContext?.head.kind === "branch"
        ? entry.gitContext.head.name
        : null,
    workItem: entry.workItem,
    workItemAttribution: entry.workItemAttribution,
  }));
  assert.deepEqual(observed, [
    {
      branch: "OPS-7/cleanup",
      workItem: { kind: "issue", number: 134, source: "user_provided" },
      workItemAttribution: "explicit_prompt",
    },
  ]);
});

test("when a Jira branch is observed before the prompt, subsequent turns retain branch provenance", async (t) => {
  // Arrange
  const fixture = await createFixture(t);
  execFileSync("git", [
    "-C",
    fixture.directory,
    "checkout",
    "--quiet",
    "-b",
    "OPS-7/cleanup",
  ]);
  await fixture.emit("session_start");

  // Act
  await fixture.emit("before_agent_start");
  await fixture.emit("agent_start");
  fixture.at(1_010_000);
  await fixture.emit("turn_end");
  fixture.at(1_020_000);
  await fixture.emit("agent_end");
  await fixture.emit("session_shutdown");

  // Assert
  const entries = await fixture.ledger.entries();
  const agentEntries = entries.filter(
    (entry) => entry.sourceKind === "agent_turn_elapsed",
  );
  assert.deepEqual(
    agentEntries.map(
      ({ startAtMs, endAtMs, workItem, workItemAttribution }) => ({
        startAtMs,
        endAtMs,
        workItem,
        workItemAttribution,
      }),
    ),
    [
      {
        startAtMs: 1_000_000,
        endAtMs: 1_020_000,
        workItem: { kind: "jira", key: "OPS-7", source: "active_branch" },
        workItemAttribution: "active_branch",
      },
    ],
  );
});

test("when a Git lookup finishes after a later observation arrives, intervals retain callback order", async (t) => {
  // Arrange
  const resolver = new GitContextResolver();
  const gate = new EventEmitter();
  let blockNext = false;
  const fixture = await createFixture(t, {
    async resolve(cwd, repository) {
      const context = await resolver.resolve(cwd, repository);
      if (blockNext) {
        blockNext = false;
        const released = once(gate, "release");
        gate.emit("started");
        await released;
      }
      return context;
    },
  });
  await fixture.emit("before_agent_start");
  await fixture.emit("agent_start");
  blockNext = true;
  const started = once(gate, "started");

  // Act
  fixture.at(1_010_000);
  const earlier = fixture.emit("turn_end");
  await started;
  execFileSync("git", [
    "-C",
    fixture.directory,
    "checkout",
    "--quiet",
    "-b",
    "OPS-7/later",
  ]);
  fixture.at(1_020_000);
  const later = fixture.emit("turn_end");
  gate.emit("release");
  await Promise.all([earlier, later]);
  fixture.at(1_030_000);
  await fixture.emit("agent_end");
  await fixture.emit("session_shutdown");

  // Assert
  const entries = await fixture.ledger.entries();
  const agentEntries = entries.filter(
    (entry) => entry.sourceKind === "agent_turn_elapsed",
  );
  assert.deepEqual(
    agentEntries.map(({ startAtMs, endAtMs, gitContext }) => ({
      startAtMs,
      endAtMs,
      branch: gitContext?.head.kind === "branch" ? gitContext.head.name : null,
    })),
    [
      { startAtMs: 1_000_000, endAtMs: 1_020_000, branch: "initial" },
      { startAtMs: 1_020_000, endAtMs: 1_030_000, branch: "OPS-7/later" },
    ],
  );
});

test("when ambiguous branch metadata gains a verified PR, a continuing run adopts its authoritative association", async (t) => {
  // Arrange
  const resolver = new GitContextResolver();
  let linked = false;
  const fixture = await createFixture(t, {
    async resolve(cwd, repository) {
      const context = await resolver.resolve(cwd, repository);
      if (!linked) return context;
      return {
        ...context,
        workItem: {
          kind: "pull_request",
          number: 73,
          source: "linked_pull_request",
        },
        workItemAttribution: "linked_pull_request",
      };
    },
  });
  execFileSync("git", [
    "-C",
    fixture.directory,
    "checkout",
    "--quiet",
    "-b",
    "APP-42-OPS-7",
  ]);
  await fixture.emit("before_agent_start");
  await fixture.emit("agent_start");
  fixture.at(1_010_000);
  await fixture.emit("turn_end");

  // Act
  linked = true;
  fixture.at(1_020_000);
  await fixture.emit("turn_end");
  fixture.at(1_030_000);
  await fixture.emit("agent_end");
  await fixture.emit("session_shutdown");

  // Assert
  const entries = await fixture.ledger.entries();
  const agentEntries = entries.filter(
    (entry) => entry.sourceKind === "agent_turn_elapsed",
  );
  assert.deepEqual(
    agentEntries.map(
      ({ startAtMs, endAtMs, workItem, workItemAttribution }) => ({
        startAtMs,
        endAtMs,
        workItem,
        workItemAttribution,
      }),
    ),
    [
      {
        startAtMs: 1_000_000,
        endAtMs: 1_020_000,
        workItem: undefined,
        workItemAttribution: "unassigned",
      },
      {
        startAtMs: 1_020_000,
        endAtMs: 1_030_000,
        workItem: {
          kind: "pull_request",
          number: 73,
          source: "linked_pull_request",
        },
        workItemAttribution: "linked_pull_request",
      },
    ],
  );
});

test("when a prompt names multiple work items, a linked PR cannot override that explicit ambiguity", async (t) => {
  // Arrange
  const resolver = new GitContextResolver();
  const fixture = await createFixture(t, {
    async resolve(cwd, repository) {
      return {
        ...(await resolver.resolve(cwd, repository)),
        workItem: {
          kind: "pull_request",
          number: 73,
          source: "linked_pull_request",
        },
        workItemAttribution: "linked_pull_request",
      };
    },
  });

  // Act
  await fixture.emit("before_agent_start", "Review PR #1 and PR #2.");
  await fixture.emit("agent_start");
  fixture.at(1_010_000);
  await fixture.emit("turn_end");
  fixture.at(1_020_000);
  await fixture.emit("agent_end");
  await fixture.emit("session_shutdown");

  // Assert
  const entries = await fixture.ledger.entries();
  const agentEntries = entries.filter(
    (entry) => entry.sourceKind === "agent_turn_elapsed",
  );
  assert.deepEqual(
    agentEntries.map(({ workItem, workItemAttribution }) => ({
      workItem,
      workItemAttribution,
    })),
    [{ workItem: undefined, workItemAttribution: "ambiguous" }],
  );
});

test("when the host switches its mutable manager before old callbacks finish, the new session starts without old activity", async (t) => {
  // Arrange
  const fixture = await createFixture(t);
  await fixture.emit("session_start");
  await fixture.emit("before_agent_start", "Review issue #134.");
  await fixture.emit("agent_start");
  fixture.at(1_010_000);
  fixture.selectSession("next-session");

  // Act
  await fixture.emit("turn_end");
  await fixture.emit("agent_end");
  await fixture.emit("session_switch");
  await fixture.emit("session_shutdown");

  // Assert
  const state = loadPersistedProjectTimeState(
    fixture.sessionEntries.get("next-session") ?? [],
  );
  assert.equal(state.promptCount, 0);
  assert.equal(state.activeStartAtMs, undefined);
  assert.equal(state.workItem, undefined);
});

test("when old turn callbacks arrive after manager replacement, AI intervals retain their original session owner", async (t) => {
  // Arrange
  const fixture = await createFixture(t);
  await fixture.emit("before_agent_start");
  await fixture.emit("agent_start");
  fixture.at(1_010_000);
  fixture.selectSession("next-session");

  // Act
  await fixture.emit("turn_end");
  await fixture.emit("agent_end");
  await fixture.emit("session_switch");
  fixture.at(1_020_000);
  await fixture.emit("before_agent_start");
  await fixture.emit("agent_start");
  fixture.at(1_030_000);
  await fixture.emit("agent_end");
  await fixture.emit("session_shutdown");

  // Assert
  const entries = await fixture.ledger.entries();
  const agentEntries = entries.filter(
    (entry) => entry.sourceKind === "agent_turn_elapsed",
  );
  assert.deepEqual(
    agentEntries.map(({ sessionId, startAtMs, endAtMs }) => ({
      sessionId,
      startAtMs,
      endAtMs,
    })),
    [
      {
        sessionId: "context-session",
        startAtMs: 1_000_000,
        endAtMs: 1_010_000,
      },
      { sessionId: "next-session", startAtMs: 1_020_000, endAtMs: 1_030_000 },
    ],
  );
});

test("when terminal events arrive before the host becomes idle, later prompts retain the observed run bounds", async (t) => {
  // Arrange
  const fixture = await createFixture(t);
  await fixture.emit("before_agent_start");
  await fixture.emit("agent_start");

  // Act
  fixture.at(1_010_000);
  await fixture.emit("agent_end");
  fixture.at(1_020_000);
  await fixture.emit("before_agent_start");
  await fixture.emit("agent_start");
  fixture.at(1_030_000);
  await fixture.emit("agent_end");
  fixture.at(1_050_000);
  await fixture.emit("session_shutdown");

  // Assert
  const entries = await fixture.ledger.entries();
  assert.deepEqual(
    entries
      .filter((entry) => entry.sourceKind === "agent_turn_elapsed")
      .map(({ startAtMs, endAtMs }) => ({ startAtMs, endAtMs })),
    [
      { startAtMs: 1_000_000, endAtMs: 1_010_000 },
      { startAtMs: 1_020_000, endAtMs: 1_030_000 },
    ],
  );
});

test("when cancellation replaces the session while a prompt is queued, the fresh session does not inherit that prompt", async (t) => {
  // Arrange
  const signals = new EventEmitter();
  const resolver = new GitContextResolver();
  let blockNextObservation = false;
  const fixture = await createFixture(t, {
    async resolve(cwd, repository) {
      const resolution = await resolver.resolve(cwd, repository);
      if (blockNextObservation) {
        blockNextObservation = false;
        signals.emit("blocked");
        await once(signals, "release");
      }
      return resolution;
    },
  });
  await fixture.emit("before_agent_start");
  await fixture.emit("agent_start");
  fixture.at(1_010_000);
  blockNextObservation = true;
  const blocked = once(signals, "blocked");
  const pendingTurn = fixture.emit("turn_end");
  await blocked;

  // Act
  const pendingPrompt = fixture.emit(
    "before_agent_start",
    "Review issue #134.",
  );
  fixture.selectSession("next-session");
  const switched = fixture.emit("session_switch");
  signals.emit("release");
  await Promise.all([pendingTurn, pendingPrompt, switched]);
  await fixture.emit("session_shutdown");

  // Assert
  const state = loadPersistedProjectTimeState(
    fixture.sessionEntries.get("next-session") ?? [],
  );
  assert.equal(state.promptCount, 0);
  assert.equal(state.activeStartAtMs, undefined);
  assert.equal(state.workItem, undefined);
});
