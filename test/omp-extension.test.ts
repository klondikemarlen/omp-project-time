import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import ompProjectTimeExtension from "../src/omp-extension.js";
import { parseProjectTimeConfig } from "../src/config/project-time-config.js";
import { TimeLogLedger } from "../src/time-log/infrastructure/ledger.js";
import type {
  BeforeAgentStartHandler,
  ExtensionApi,
  ExtensionContext,
  SessionHandler,
} from "../src/extension/types.js";

test("records automatic evidence when optional generation never settles", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "project-time-timeout-"));
  const timeLogPath = path.join(directory, "time-log.sqlite");
  const persisted: unknown[] = [];
  let beforeAgentStart: BeforeAgentStartHandler | undefined;
  let sessionShutdown: SessionHandler | undefined;
  let generationCalls = 0;
  const pi: ExtensionApi = {
    registerCommand() {},
    on(event, handler) {
      if (event === "before_agent_start") {
        beforeAgentStart = handler as BeforeAgentStartHandler;
      }
      if (event === "session_shutdown") {
        sessionShutdown = handler as SessionHandler;
      }
    },
    appendEntry(_customType, data) {
      persisted.push(data);
    },
  };
  const context: ExtensionContext = {
    cwd: directory,
    ui: {
      notify() {},
      setStatus() {},
      theme: {
        fg(_color, text) {
          return text;
        },
      },
    },
    sessionManager: {
      getSessionId: () => "session",
      getHeader: () => null,
      getEntries: () => [],
    },
  };

  try {
    execFileSync("git", ["init", "--quiet", directory]);
    ompProjectTimeExtension(pi, {
      activityGenerationTimeoutMs: 0,
      generateActivity: () => {
        generationCalls += 1;
        return new Promise<never>(() => {});
      },
      loadConfig: async () => parseProjectTimeConfig(),
      timeLogPath,
    });
    assert.ok(beforeAgentStart);
    assert.ok(sessionShutdown);

    const completed = await Promise.race([
      beforeAgentStart({ prompt: "Record this prompt." }, context).then(
        () => true,
      ),
      new Promise<false>((resolve) => setTimeout(() => resolve(false), 100)),
    ]);
    await new Promise((resolve) => setTimeout(resolve, 1));
    await sessionShutdown({}, context);

    assert.equal(completed, true);
    assert.equal(generationCalls, 1);
    const state = persisted.at(-1) as Record<string, unknown>;
    assert.deepEqual(
      {
        activity: state.activity,
        promptCount: state.promptCount,
        workItemAttribution: state.workItemAttribution,
      },
      {
        activity: "General Work",
        promptCount: 1,
        workItemAttribution: "unassigned",
      },
    );
    const entries = await new TimeLogLedger(timeLogPath).entries();
    assert.deepEqual(
      entries.map((entry) => entry.sourceKind).sort(),
      ["agent_turn_elapsed", "human_active"],
    );
    assert.equal(
      entries.every(
        (entry) =>
          entry.activity === "General Work" &&
          entry.workItemAttribution === "unassigned" &&
          entry.narrative === undefined,
      ),
      true,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
