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
  const directory = await mkdtemp(path.join(tmpdir(), "project-time-run-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  execFileSync("git", ["init", "--quiet", directory]);
  const databasePath = path.join(directory, "time-log.sqlite");
  const handlers = new Map<
    string,
    (event: never, ctx: ExtensionContext) => Promise<void>
  >();
  const api: ExtensionApi = {
    registerCommand() {},
    appendEntry() {},
    on(event, handler) {
      handlers.set(event, handler);
    },
  };
  const context = (sessionId: string): ExtensionContext => ({
    cwd: directory,
    sessionManager: {
      getSessionId: () => sessionId,
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
  });
  new ProjectTimeRuntime(api, {
    timeLogPath: databasePath,
    loadConfig: async () =>
      parseProjectTimeConfig({ "Active Window Minutes": 1 }),
  }).register();
  let nowMs = 1_000_000;
  t.mock.method(Date, "now", () => nowMs);
  return {
    context,
    ledger: new TimeLogLedger(databasePath),
    at(timestampMs: number) {
      nowMs = timestampMs;
    },
    async emit(event: string, ctx: ExtensionContext, willContinue?: boolean) {
      const handler = handlers.get(event);
      if (handler === undefined)
        throw new Error(`Missing lifecycle handler: ${event}`);
      await handler(
        { type: event, prompt: "Review issue #149.", willContinue } as never,
        ctx,
      );
    },
  };
}

test("when a tool loop outlasts the human window, evidence covers the complete run", async (t) => {
  // Arrange
  const fixture = await createFixture(t);
  const ctx = fixture.context("multi-turn");

  // Act
  await fixture.emit("before_agent_start", ctx);
  await fixture.emit("agent_start", ctx);
  fixture.at(1_010_123);
  await fixture.emit("turn_end", ctx);
  fixture.at(1_090_456);
  await fixture.emit("turn_end", ctx);
  fixture.at(1_120_789);
  await fixture.emit("turn_end", ctx);
  await fixture.emit("agent_end", ctx);
  fixture.at(1_500_000);
  await fixture.emit("session_shutdown", ctx);

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
    [{ sessionId: "multi-turn", startAtMs: 1_000_000, endAtMs: 1_120_789 }],
  );
  const humanEntries = entries.filter(
    (entry) => entry.sourceKind === "human_active",
  );
  assert.equal(
    humanEntries.reduce(
      (duration, entry) => duration + entry.endAtMs - entry.startAtMs,
      0,
    ),
    60_000,
  );
  // The overlapping sources cover 120789 ms, not the first turn's 10123 ms or their sum.
  assert.equal(
    Math.max(...entries.map((entry) => entry.endAtMs)) -
      Math.min(...entries.map((entry) => entry.startAtMs)),
    120_789,
  );
});

test("when a single-turn run completes, shutdown cannot extend its recorded bounds", async (t) => {
  // Arrange
  const fixture = await createFixture(t);
  const ctx = fixture.context("single-turn");

  // Act
  await fixture.emit("before_agent_start", ctx);
  await fixture.emit("agent_start", ctx);
  fixture.at(1_005_321);
  await fixture.emit("turn_end", ctx);
  await fixture.emit("agent_end", ctx);
  fixture.at(1_100_000);
  await fixture.emit("session_shutdown", ctx);

  // Assert
  const entries = await fixture.ledger.entries();
  assert.deepEqual(
    entries
      .filter((entry) => entry.sourceKind === "agent_turn_elapsed")
      .map(({ startAtMs, endAtMs }) => [startAtMs, endAtMs]),
    [[1_000_000, 1_005_321]],
  );
});

test("when the host announces continuation, the next agent loop retains the original run start", async (t) => {
  // Arrange
  const fixture = await createFixture(t);
  const ctx = fixture.context("continuing");

  // Act
  await fixture.emit("before_agent_start", ctx);
  await fixture.emit("agent_start", ctx);
  fixture.at(1_010_000);
  await fixture.emit("agent_end", ctx, true);
  fixture.at(1_015_000);
  await fixture.emit("agent_start", ctx);
  fixture.at(1_090_123);
  await fixture.emit("agent_end", ctx, false);
  await fixture.emit("session_shutdown", ctx);

  // Assert
  const entries = await fixture.ledger.entries();
  assert.deepEqual(
    entries
      .filter((entry) => entry.sourceKind === "agent_turn_elapsed")
      .map(({ startAtMs, endAtMs }) => [startAtMs, endAtMs]),
    [[1_000_000, 1_090_123]],
  );
});

test("when cancellation emits agent_end after a partial turn, the cancelled run closes once", async (t) => {
  // Arrange
  const fixture = await createFixture(t);
  const ctx = fixture.context("cancelled");

  // Act
  await fixture.emit("before_agent_start", ctx);
  await fixture.emit("agent_start", ctx);
  fixture.at(1_010_000);
  await fixture.emit("turn_end", ctx);
  fixture.at(1_015_678);
  await fixture.emit("agent_end", ctx);
  fixture.at(1_100_000);
  await fixture.emit("session_shutdown", ctx);

  // Assert
  const entries = await fixture.ledger.entries();
  assert.deepEqual(
    entries
      .filter((entry) => entry.sourceKind === "agent_turn_elapsed")
      .map(({ startAtMs, endAtMs }) => [startAtMs, endAtMs]),
    [[1_000_000, 1_015_678]],
  );
});

test("when shutdown observes an unfinished run, it closes at shutdown rather than the last tool turn", async (t) => {
  // Arrange
  const fixture = await createFixture(t);
  const ctx = fixture.context("shutdown");

  // Act
  await fixture.emit("before_agent_start", ctx);
  await fixture.emit("agent_start", ctx);
  fixture.at(1_010_000);
  await fixture.emit("turn_end", ctx);
  fixture.at(1_075_432);
  await fixture.emit("session_shutdown", ctx);
  fixture.at(1_200_000);
  await fixture.emit("session_shutdown", ctx);

  // Assert
  const entries = await fixture.ledger.entries();
  assert.deepEqual(
    entries
      .filter((entry) => entry.sourceKind === "agent_turn_elapsed")
      .map(({ startAtMs, endAtMs }) => [startAtMs, endAtMs]),
    [[1_000_000, 1_075_432]],
  );
});

test("when switching sessions after the human window, the old run cannot leak into the new session", async (t) => {
  // Arrange
  const fixture = await createFixture(t);
  const previous = fixture.context("previous");
  const next = fixture.context("next");

  // Act
  await fixture.emit("before_agent_start", previous);
  await fixture.emit("agent_start", previous);
  fixture.at(1_070_000);
  await fixture.emit("turn_end", previous);
  fixture.at(1_080_123);
  await fixture.emit("session_switch", next);
  fixture.at(1_100_000);
  await fixture.emit("before_agent_start", next);
  await fixture.emit("agent_start", next);
  fixture.at(1_110_456);
  await fixture.emit("agent_end", next);
  await fixture.emit("session_shutdown", next);

  // Assert
  const entries = await fixture.ledger.entries();
  assert.deepEqual(
    entries
      .filter((entry) => entry.sourceKind === "agent_turn_elapsed")
      .map(({ sessionId, startAtMs, endAtMs }) => ({
        sessionId,
        startAtMs,
        endAtMs,
      })),
    [
      { sessionId: "previous", startAtMs: 1_000_000, endAtMs: 1_080_123 },
      { sessionId: "next", startAtMs: 1_100_000, endAtMs: 1_110_456 },
    ],
  );
});

test("when a run has no terminal observation, a later prompt does not invent its end", async (t) => {
  // Arrange
  const fixture = await createFixture(t);
  const ctx = fixture.context("missing-terminal");

  // Act
  await fixture.emit("before_agent_start", ctx);
  await fixture.emit("agent_start", ctx);
  fixture.at(1_010_000);
  await fixture.emit("turn_end", ctx);
  fixture.at(1_200_000);
  await fixture.emit("before_agent_start", ctx);
  await fixture.emit("agent_start", ctx);
  fixture.at(1_205_000);
  await fixture.emit("agent_end", ctx);
  await fixture.emit("session_shutdown", ctx);

  // Assert
  const entries = await fixture.ledger.entries();
  assert.deepEqual(
    entries
      .filter((entry) => entry.sourceKind === "agent_turn_elapsed")
      .map(({ startAtMs, endAtMs }) => [startAtMs, endAtMs]),
    [[1_200_000, 1_205_000]],
  );
});

test("when a process resumes without a pending in-memory run, shutdown does not backfill AI time", async (t) => {
  // Arrange
  const fixture = await createFixture(t);
  const ctx = fixture.context("resumed");

  // Act
  await fixture.emit("session_start", ctx);
  fixture.at(1_500_000);
  await fixture.emit("session_shutdown", ctx);

  // Assert
  assert.deepEqual(await fixture.ledger.entries(), []);
});
