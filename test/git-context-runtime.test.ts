import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";

import { parseProjectTimeConfig } from "../src/config/project-time-config.js";
import { ProjectTimeRuntime } from "../src/extension/runtime.js";
import type { ExtensionApi, ExtensionContext } from "../src/extension/types.js";
import { TimeLogLedger } from "../src/time-log/infrastructure/ledger.js";

async function createFixture(t: TestContext) {
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
  const api: ExtensionApi = {
    registerCommand() {},
    appendEntry() {},
    on(name, handler) {
      handlers.set(name, handler);
    },
  };
  const ctx: ExtensionContext = {
    cwd: directory,
    sessionManager: {
      getSessionId: () => "context-session",
      getHeader: () => null,
      getEntries: () => [],
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
  }).register();
  let nowMs = 1_000_000;
  t.mock.method(Date, "now", () => nowMs);
  return {
    directory,
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
  assert.partialDeepStrictEqual(entries, [
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
  assert.partialDeepStrictEqual(agentEntries, [
    {
      startAtMs: 1_000_000,
      endAtMs: 1_010_000,
      gitContext: { head: { name: "initial" } },
      workItem: { kind: "issue", number: 134, source: "user_provided" },
      workItemAttribution: "explicit_prompt",
    },
    {
      startAtMs: 1_020_000,
      endAtMs: 1_030_000,
      gitContext: { head: { name: "OPS-7/cleanup" } },
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
  assert.partialDeepStrictEqual(agentEntries, [
    {
      gitContext: { head: { name: "OPS-7/cleanup" } },
      workItem: { kind: "issue", number: 134, source: "user_provided" },
      workItemAttribution: "explicit_prompt",
    },
  ]);
});
