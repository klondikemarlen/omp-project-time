import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";

import { parseProjectTimeConfig } from "@/config/project-time-config.js";
import { ProjectTimeRuntime } from "@/extension/runtime.js";
import {
  PROJECT_TIME_LIVE_EVENT,
  PROJECT_TIME_LIVE_REQUEST_EVENT,
} from "@/extension/types.js";
import type {
  ExtensionApi,
  ExtensionContext,
  ProjectTimeLiveSnapshot,
  SessionEntryLike,
} from "@/extension/types.js";
import { resolveGitRepository } from "@/infrastructure/git-repository.js";
import type { AutomaticTimeLogInput } from "@/time-log/domain/model.js";
import { TimeLogLedger } from "@/time-log/infrastructure/ledger.js";

type LifecycleHandler = (
  event: never,
  ctx: ExtensionContext,
) => Promise<void>;

type EventListener = (data: unknown) => unknown;

type FixtureOptions = {
  activeWindowMinutes?: number;
};

async function createFixture(t: TestContext, options: FixtureOptions = {}) {
  const directory = await mkdtemp(path.join(tmpdir(), "project-time-live-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  execFileSync("git", ["init", "--quiet", directory]);
  execFileSync("git", [
    "-C",
    directory,
    "remote",
    "add",
    "origin",
    "https://github.com/acme/live-project.git",
  ]);

  const repository = await resolveGitRepository(directory);
  assert.ok(repository);

  const databasePath = path.join(directory, "time-log.sqlite");
  const ledger = new TimeLogLedger(databasePath);
  const lifecycleHandlers = new Map<string, LifecycleHandler>();
  const eventListeners = new Map<string, EventListener[]>();
  const snapshots: ProjectTimeLiveSnapshot[] = [];
  const statuses: Array<string | undefined> = [];
  const sessionEntries = new Map<string, SessionEntryLike[]>([["current", []]]);
  let currentSessionId = "current";
  let failSessionRead = false;
  let nowMs = 1_000_000;

  t.mock.method(Date, "now", () => nowMs);

  const events = {
    emit(channel: string, data: unknown) {
      for (const listener of eventListeners.get(channel) ?? []) {
        listener(data);
      }
    },
    on(channel: string, handler: (data: unknown) => void) {
      const listeners = eventListeners.get(channel) ?? [];
      const listener = handler as EventListener;
      listeners.push(listener);
      eventListeners.set(channel, listeners);
      return () => {
        const index = listeners.indexOf(listener);
        if (index !== -1) listeners.splice(index, 1);
      };
    },
  };

  events.on(PROJECT_TIME_LIVE_EVENT, (data) => {
    snapshots.push(data as ProjectTimeLiveSnapshot);
  });

  const api: ExtensionApi = {
    events,
    registerCommand() {},
    appendEntry(customType, data) {
      const entries = sessionEntries.get(currentSessionId) ?? [];
      entries.push({ type: "custom", customType, data });
      sessionEntries.set(currentSessionId, entries);
    },
    on(event, handler) {
      lifecycleHandlers.set(event, handler as LifecycleHandler);
    },
  };

  const runtime = new ProjectTimeRuntime(api, {
    timeLogPath: databasePath,
    loadConfig: async () =>
      parseProjectTimeConfig({
        "Active Window Minutes": options.activeWindowMinutes ?? 5,
      }),
  });
  runtime.register();

  const context: ExtensionContext = {
    cwd: directory,
    sessionManager: {
      getSessionId: () => currentSessionId,
      getHeader: () => null,
      getEntries: () => {
        if (failSessionRead) throw new Error("session state unavailable");
        return sessionEntries.get(currentSessionId) ?? [];
      },
    },
    ui: {
      notify() {},
      setStatus(_key, text) {
        statuses.push(text);
      },
      theme: {
        fg(_color, text) {
          return text;
        },
      },
    },
  };

  return {
    context,
    ledger,
    project: repository.project,
    snapshots,
    statuses,
    setNow(timestampMs: number) {
      nowMs = timestampMs;
    },
    setSessionId(sessionId: string) {
      currentSessionId = sessionId;
      sessionEntries.set(sessionId, sessionEntries.get(sessionId) ?? []);
    },
    setSessionEntries(sessionId: string, entries: SessionEntryLike[]) {
      sessionEntries.set(sessionId, entries);
    },
    failSessionRead() {
      failSessionRead = true;
    },
    async emit(
      event: string,
      ctx: ExtensionContext,
      extra: Record<string, unknown> = {},
    ) {
      const handler = lifecycleHandlers.get(event);
      if (handler === undefined) {
        throw new Error(`Missing lifecycle handler: ${event}`);
      }
      await handler(
        { type: event, prompt: "Review the live status contract.", ...extra } as never,
        ctx,
      );
    },
    async request(data: unknown) {
      await Promise.all(
        (eventListeners.get(PROJECT_TIME_LIVE_REQUEST_EVENT) ?? []).map(
          (listener) => Promise.resolve(listener(data)),
        ),
      );
    },
  };
}

async function recordEntry(
  ledger: TimeLogLedger,
  sourceKind: AutomaticTimeLogInput["sourceKind"],
  project: string,
  sessionId: string,
  startAtMs: number,
  endAtMs: number,
): Promise<void> {
  await ledger.recordAutomatic({
    sourceKind,
    project,
    repositoryId: `${project}-repository`,
    sessionId,
    sourceKey: `${sessionId}:${project}:${sourceKind}:${startAtMs}:${endAtMs}`,
    startAtMs,
    endAtMs,
  });
}

test("when Worklog requests live totals, filters by session and project", async (t) => {
  // Arrange
  const fixture = await createFixture(t);
  const ctx = fixture.context;
  await recordEntry(
    fixture.ledger,
    "human_active",
    fixture.project,
    "current",
    100,
    300,
  );
  await recordEntry(
    fixture.ledger,
    "human_active",
    fixture.project,
    "current",
    200,
    500,
  );
  await recordEntry(
    fixture.ledger,
    "agent_turn_elapsed",
    fixture.project,
    "current",
    150,
    250,
  );
  await recordEntry(
    fixture.ledger,
    "agent_turn_elapsed",
    fixture.project,
    "current",
    225,
    600,
  );
  await recordEntry(
    fixture.ledger,
    "human_active",
    fixture.project,
    "other-session",
    0,
    9_000,
  );
  await recordEntry(
    fixture.ledger,
    "agent_turn_elapsed",
    "other-project",
    "current",
    0,
    9_000,
  );
  await recordEntry(
    fixture.ledger,
    "human_active",
    fixture.project,
    "current",
    450,
    600,
  );
  fixture.setNow(400);

  // Act
  await fixture.emit("session_start", ctx);
  await fixture.request({ sessionId: "current", presentation: "worklog" });

  // Assert
  const snapshot = fixture.snapshots.at(-1);
  assert.deepEqual(snapshot, {
    version: 1,
    sessionId: "current",
    project: fixture.project,
    humanMilliseconds: 300,
    agentMilliseconds: 250,
    humanActive: false,
    agentActive: false,
    observedAtMs: 400,
  });
  assert.equal(JSON.stringify(snapshot ?? {}).includes(fixture.context.cwd), false);
});

test("when a session resumes during an active window, preserves observed activity", async (t) => {
  // Arrange
  const active = await createFixture(t, { activeWindowMinutes: 1 });
  active.setSessionEntries("current", [
    {
      type: "custom",
      customType: "project-time.state",
      data: {
        promptCount: 1,
        activeMilliseconds: 0,
        activeStartAtMs: 950_000,
        activeUntilMs: 1_050_000,
        lastSettledAtMs: 950_000,
        activityStartedAtMs: 950_000,
      },
    },
  ]);

  // Act
  await active.emit("session_start", active.context);

  // Assert
  assert.deepEqual(active.snapshots.at(-1), {
    version: 1,
    sessionId: "current",
    project: active.project,
    humanMilliseconds: 50_000,
    agentMilliseconds: 0,
    humanActive: true,
    agentActive: false,
    observedAtMs: 1_000_000,
  });
});

test("when a session resumes after the active window, bounds activity at expiry", async (t) => {
  // Arrange
  const expired = await createFixture(t, { activeWindowMinutes: 1 });
  expired.setNow(1_060_000);
  expired.setSessionEntries("current", [
    {
      type: "custom",
      customType: "project-time.state",
      data: {
        promptCount: 1,
        activeMilliseconds: 0,
        activeStartAtMs: 950_000,
        activeUntilMs: 1_050_000,
        lastSettledAtMs: 950_000,
        activityStartedAtMs: 950_000,
      },
    },
  ]);

  // Act
  await expired.emit("session_start", expired.context);

  // Assert
  assert.deepEqual(expired.snapshots.at(-1), {
    version: 1,
    sessionId: "current",
    project: expired.project,
    humanMilliseconds: 100_000,
    agentMilliseconds: 0,
    humanActive: false,
    agentActive: false,
    observedAtMs: 1_060_000,
  });
});

test("when an agent run outlasts the human window, refreshes agent totals", async (t) => {
  // Arrange
  const fixture = await createFixture(t, { activeWindowMinutes: 1 });
  const ctx = fixture.context;

  // Act
  await fixture.emit("session_start", ctx);
  await fixture.emit("before_agent_start", ctx);
  await fixture.emit("agent_start", ctx);
  fixture.setNow(1_060_000);
  await fixture.emit("turn_end", ctx);
  const expiredHumanSnapshot = fixture.snapshots.at(-1);
  fixture.setNow(1_070_000);
  await fixture.emit("turn_end", ctx);

  // Assert
  assert.deepEqual(expiredHumanSnapshot, {
    version: 1,
    sessionId: "current",
    project: fixture.project,
    humanMilliseconds: 60_000,
    agentMilliseconds: 60_000,
    humanActive: false,
    agentActive: true,
    observedAtMs: 1_060_000,
  });
  assert.equal(fixture.snapshots.at(-1)?.agentMilliseconds, 70_000);
  assert.equal(fixture.snapshots.at(-1)?.agentActive, true);
});

test("when a session switch releases Worklog presentation, only the selected session shows status", async (t) => {
  // Arrange
  const fixture = await createFixture(t, { activeWindowMinutes: 5 });
  const ctx = fixture.context;
  await fixture.emit("session_start", ctx);
  await fixture.emit("before_agent_start", ctx);
  const initialStatus = fixture.statuses.at(-1);

  // Act
  await fixture.request({ sessionId: "current", presentation: "worklog" });
  const statusAfterWorklogRequest = fixture.statuses.at(-1);
  fixture.setSessionId("next-session");
  await fixture.emit("session_switch", ctx);
  await fixture.emit("before_agent_start", ctx);
  const nextSessionStatus = fixture.statuses.at(-1);
  await fixture.request({ sessionId: "current" });
  const statusAfterStaleRequest = fixture.statuses.at(-1);
  fixture.setSessionId("current");
  await fixture.emit("session_switch", ctx);
  await fixture.emit("before_agent_start", ctx);
  const statusAfterReturning = fixture.statuses.at(-1);

  // Assert
  assert.notEqual(initialStatus, undefined);
  assert.equal(statusAfterWorklogRequest, undefined);
  assert.notEqual(nextSessionStatus, undefined);
  assert.equal(statusAfterStaleRequest, nextSessionStatus);
  assert.notEqual(statusAfterReturning, undefined);
});

test("when live evidence reading fails, emits unavailable rather than stale totals", async (t) => {
  // Arrange
  const fixture = await createFixture(t);
  await fixture.emit("session_start", fixture.context);
  await fixture.request({ sessionId: "current", presentation: "worklog" });
  const validSnapshot = fixture.snapshots.at(-1);

  // Act
  fixture.failSessionRead();
  await fixture.request({ sessionId: "current", presentation: "worklog" });
  const unavailable = fixture.snapshots.at(-1);

  // Assert
  assert.equal(validSnapshot?.humanMilliseconds, 0);
  assert.equal(unavailable?.sessionId, "current");
  assert.equal(unavailable?.project, fixture.project);
  assert.equal(unavailable?.humanActive, false);
  assert.equal(unavailable?.agentActive, false);
  assert.equal(unavailable?.humanMilliseconds, undefined);
  assert.equal(unavailable?.agentMilliseconds, undefined);
});
