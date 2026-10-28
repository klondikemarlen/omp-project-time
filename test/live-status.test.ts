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
  captureRefreshTimers?: boolean;
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
  const refreshCallbacks: Array<() => Promise<void>> = [];

  t.mock.method(Date, "now", () => nowMs);

  if (options.captureRefreshTimers === true) {
    t.mock.method(
      globalThis,
      "setTimeout",
      ((callback: () => Promise<void>) => {
        refreshCallbacks.push(callback);
        return { unref() {} } as unknown as NodeJS.Timeout;
      }) as typeof setTimeout,
    );
    t.mock.method(
      globalThis,
      "clearTimeout",
      (() => undefined) as typeof clearTimeout,
    );
  }

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
    async runRefresh() {
      const callback = refreshCallbacks.shift();
      assert.ok(callback);
      await callback();
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

function localDayStartAtMs(timestampMs: number): number {
  const localDay = new Date(timestampMs);
  localDay.setHours(0, 0, 0, 0);
  return localDay.getTime();
}

function dailySnapshotFields(
  timestampMs: number,
  humanMilliseconds: number,
  agentMilliseconds: number,
  activity?: string,
) {
  return {
    todayHumanMilliseconds: humanMilliseconds,
    todayAgentMilliseconds: agentMilliseconds,
    dayStartAtMs: localDayStartAtMs(timestampMs),
    ...(activity === undefined ? {} : { activity }),
  };
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
    ...dailySnapshotFields(400, 300, 250),
    humanActive: false,
    agentActive: false,
    observedAtMs: 400,
  });
  assert.equal(JSON.stringify(snapshot ?? {}).includes(fixture.context.cwd), false);
});

test("when persisted source intervals cross local midnight, unions overlaps before clipping today's totals", async (t) => {
  // Arrange
  const fixture = await createFixture(t);
  const dayStartAtMs = new Date(2026, 5, 18).getTime();
  const observedAtMs = dayStartAtMs + 60_000;
  fixture.setSessionEntries("current", [
    {
      type: "custom",
      customType: "project-time.state",
      data: {
        promptCount: 1,
        activeMilliseconds: 0,
        activity: "Review Snapshot",
      },
    },
  ]);
  await recordEntry(
    fixture.ledger,
    "human_active",
    fixture.project,
    "current",
    dayStartAtMs - 10_000,
    dayStartAtMs + 30_000,
  );
  await recordEntry(
    fixture.ledger,
    "human_active",
    fixture.project,
    "current",
    dayStartAtMs + 20_000,
    dayStartAtMs + 40_000,
  );
  await recordEntry(
    fixture.ledger,
    "agent_turn_elapsed",
    fixture.project,
    "current",
    dayStartAtMs - 20_000,
    dayStartAtMs + 10_000,
  );
  await recordEntry(
    fixture.ledger,
    "agent_turn_elapsed",
    fixture.project,
    "current",
    dayStartAtMs + 5_000,
    dayStartAtMs + 25_000,
  );
  await recordEntry(
    fixture.ledger,
    "human_active",
    fixture.project,
    "other-session",
    dayStartAtMs,
    dayStartAtMs + 60_000,
  );
  await recordEntry(
    fixture.ledger,
    "agent_turn_elapsed",
    "other-project",
    "current",
    dayStartAtMs,
    dayStartAtMs + 60_000,
  );
  fixture.setNow(observedAtMs);

  // Act
  await fixture.emit("session_start", fixture.context);
  await fixture.request({ sessionId: "current", presentation: "worklog" });

  // Assert
  assert.deepEqual(fixture.snapshots.at(-1), {
    version: 1,
    sessionId: "current",
    project: fixture.project,
    humanMilliseconds: 50_000,
    agentMilliseconds: 45_000,
    ...dailySnapshotFields(observedAtMs, 40_000, 25_000, "Review Snapshot"),
    humanActive: false,
    agentActive: false,
    observedAtMs,
  });
});

test("when ongoing clocks cross local midnight, clips each source at local midnight", async (t) => {
  // Arrange
  const fixture = await createFixture(t, { activeWindowMinutes: 1 });
  const dayStartAtMs = new Date(2026, 5, 18).getTime();
  fixture.setNow(dayStartAtMs - 5_000);

  // Act
  await fixture.emit("session_start", fixture.context);
  await fixture.emit("before_agent_start", fixture.context);
  await fixture.emit("agent_start", fixture.context);
  const observedAtMs = dayStartAtMs + 10_000;
  fixture.setNow(observedAtMs);
  await fixture.request({ sessionId: "current", presentation: "worklog" });

  // Assert
  assert.deepEqual(fixture.snapshots.at(-1), {
    version: 1,
    sessionId: "current",
    project: fixture.project,
    humanMilliseconds: 15_000,
    agentMilliseconds: 15_000,
    ...dailySnapshotFields(observedAtMs, 10_000, 10_000),
    humanActive: true,
    agentActive: true,
    observedAtMs,
  });
});

test("when local time crosses DST, clips daily totals to calendar midnight", async (t) => {
  // Arrange
  const originalTimeZone = process.env.TZ;
  process.env.TZ = "America/Los_Angeles";
  t.after(() => {
    if (originalTimeZone === undefined) {
      delete process.env.TZ;
    } else {
      process.env.TZ = originalTimeZone;
    }
  });
  const fixture = await createFixture(t);
  const springDayStartAtMs = Date.parse("2026-03-08T08:00:00.000Z");
  const springObservedAtMs = Date.parse("2026-03-08T19:00:00.000Z");
  const fallDayStartAtMs = Date.parse("2026-11-01T07:00:00.000Z");
  const fallObservedAtMs = Date.parse("2026-11-01T20:00:00.000Z");
  await recordEntry(
    fixture.ledger,
    "human_active",
    fixture.project,
    "current",
    springDayStartAtMs - 10_000,
    springDayStartAtMs + 30_000,
  );
  await recordEntry(
    fixture.ledger,
    "agent_turn_elapsed",
    fixture.project,
    "current",
    springDayStartAtMs - 20_000,
    springDayStartAtMs + 40_000,
  );
  await recordEntry(
    fixture.ledger,
    "human_active",
    fixture.project,
    "current",
    fallDayStartAtMs - 10_000,
    fallDayStartAtMs + 30_000,
  );
  await recordEntry(
    fixture.ledger,
    "agent_turn_elapsed",
    fixture.project,
    "current",
    fallDayStartAtMs - 20_000,
    fallDayStartAtMs + 40_000,
  );

  // Act
  fixture.setNow(springObservedAtMs);
  await fixture.emit("session_start", fixture.context);
  await fixture.request({ sessionId: "current", presentation: "worklog" });
  const springSnapshot = fixture.snapshots.at(-1);
  fixture.setNow(fallObservedAtMs);
  await fixture.request({ sessionId: "current", presentation: "worklog" });
  const fallSnapshot = fixture.snapshots.at(-1);

  // Assert
  assert.deepEqual(
    {
      dayStartAtMs: springSnapshot?.dayStartAtMs,
      todayHumanMilliseconds: springSnapshot?.todayHumanMilliseconds,
      todayAgentMilliseconds: springSnapshot?.todayAgentMilliseconds,
    },
    {
      dayStartAtMs: springDayStartAtMs,
      todayHumanMilliseconds: 30_000,
      todayAgentMilliseconds: 40_000,
    },
  );
  assert.deepEqual(
    {
      dayStartAtMs: fallSnapshot?.dayStartAtMs,
      todayHumanMilliseconds: fallSnapshot?.todayHumanMilliseconds,
      todayAgentMilliseconds: fallSnapshot?.todayAgentMilliseconds,
    },
    {
      dayStartAtMs: fallDayStartAtMs,
      todayHumanMilliseconds: 30_000,
      todayAgentMilliseconds: 40_000,
    },
  );
});

test("when both activity clocks stop before midnight, refreshes the selected session's snapshot for the new day", async (t) => {
  // Arrange
  const fixture = await createFixture(t, {
    activeWindowMinutes: 1,
    captureRefreshTimers: true,
  });
  const dayStartAtMs = new Date(2026, 6, 15).getTime();
  fixture.setNow(dayStartAtMs - 120_000);
  // Act
  await fixture.emit("session_start", fixture.context);
  await fixture.emit("before_agent_start", fixture.context);
  await fixture.emit("agent_start", fixture.context);
  fixture.setNow(dayStartAtMs - 5_000);
  await fixture.emit("agent_end", fixture.context);

  const stoppedSnapshot = fixture.snapshots.at(-1);

  const observedAtMs = dayStartAtMs + 10_000;
  fixture.setNow(observedAtMs);
  await fixture.runRefresh();

  // Assert
  assert.equal(stoppedSnapshot?.humanActive, false);
  assert.equal(stoppedSnapshot?.agentActive, false);
  assert.deepEqual(fixture.snapshots.at(-1), {
    version: 1,
    sessionId: "current",
    project: fixture.project,
    humanMilliseconds: 60_000,
    agentMilliseconds: 115_000,
    ...dailySnapshotFields(observedAtMs, 0, 0),
    humanActive: false,
    agentActive: false,
    observedAtMs,
  });
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
    ...dailySnapshotFields(1_000_000, 50_000, 0),
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
    ...dailySnapshotFields(1_060_000, 100_000, 0),
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
    ...dailySnapshotFields(1_060_000, 60_000, 60_000),
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
  assert.equal(unavailable?.todayHumanMilliseconds, undefined);
  assert.equal(unavailable?.todayAgentMilliseconds, undefined);
  assert.equal(unavailable?.dayStartAtMs, undefined);
});
