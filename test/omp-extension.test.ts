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
  ActivityGenerationContext,
  BeforeAgentStartHandler,
  AgentRunHandler,
  ExtensionApi,
  ExtensionContext,
  SessionHandler,
} from "../src/extension/types.js";

test("when optional generation never settles, records unlabeled automatic evidence", async (t) => {
  // Arrange
  let nowMs = 1_000_000;
  t.mock.method(Date, "now", () => nowMs++);
  const directory = await mkdtemp(path.join(tmpdir(), "project-time-timeout-"));
  const timeLogPath = path.join(directory, "time-log.sqlite");
  let beforeAgentStart: BeforeAgentStartHandler | undefined;
  let sessionShutdown: SessionHandler | undefined;
  let agentStart: AgentRunHandler | undefined;
  const pi: ExtensionApi = {
    registerCommand() {},
    on(event, handler) {
      if (event === "before_agent_start") {
        beforeAgentStart = handler as BeforeAgentStartHandler;
      }
      if (event === "session_shutdown") {
        sessionShutdown = handler as SessionHandler;
      }
      if (event === "agent_start") {
        agentStart = handler as AgentRunHandler;
      }
    },
    appendEntry() {},
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
      generateActivity: () => new Promise<never>(() => {}),
      loadConfig: async () => parseProjectTimeConfig(),
      timeLogPath,
    });
    assert.ok(beforeAgentStart);
    assert.ok(sessionShutdown);
    assert.ok(agentStart);

    // Act
    await beforeAgentStart({ prompt: "Record this prompt." }, context);
    await agentStart({ type: "agent_start" }, context);
    await sessionShutdown({}, context);

    // Assert
    const entries = await new TimeLogLedger(timeLogPath).entries();
    assert.deepEqual(entries.map((entry) => entry.sourceKind).sort(), [
      "agent_turn_elapsed",
      "human_active",
    ]);
    assert.equal(
      entries.every(
        (entry) =>
          entry.activity === undefined &&
          entry.workItemAttribution === "unassigned" &&
          entry.narrative === undefined,
      ),
      true,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("when generating labels, uses recorded repository context and preserves unlabeled evidence", async (t) => {
  // Arrange
  let nowMs = 1_000_000;
  t.mock.method(Date, "now", () => nowMs++);
  const directory = await mkdtemp(path.join(tmpdir(), "project-time-context-"));
  const timeLogPath = path.join(directory, "time-log.sqlite");
  const generatedContexts: Array<ActivityGenerationContext | undefined> = [];
  let beforeAgentStart: BeforeAgentStartHandler | undefined;
  let sessionShutdown: SessionHandler | undefined;
  let agentStart: AgentRunHandler | undefined;
  const pi: ExtensionApi = {
    registerCommand() {},
    on(event, handler) {
      if (event === "before_agent_start") {
        beforeAgentStart = handler as BeforeAgentStartHandler;
      }
      if (event === "session_shutdown") {
        sessionShutdown = handler as SessionHandler;
      }
      if (event === "agent_start") {
        agentStart = handler as AgentRunHandler;
      }
    },
    appendEntry() {},
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
    execFileSync("git", [
      "-C",
      directory,
      "remote",
      "add",
      "origin",
      "git@github.com:acme/wrap.git",
    ]);
    ompProjectTimeExtension(pi, {
      generateActivity: async (_prompt, _ctx, activityContext) => {
        generatedContexts.push(activityContext);
        return {};
      },
      loadConfig: async () => parseProjectTimeConfig(),
      timeLogPath,
    });
    assert.ok(beforeAgentStart);
    assert.ok(sessionShutdown);
    assert.ok(agentStart);

    // Act
    await beforeAgentStart({ prompt: "Review the automatic labels." }, context);
    await agentStart({ type: "agent_start" }, context);
    await sessionShutdown({}, context);

    // Assert
    assert.deepEqual(generatedContexts, [
      {
        project: "wrap",
        repositoryIdentity: "github.com/acme/wrap",
      },
    ]);
    const entries = await new TimeLogLedger(timeLogPath).entries();
    assert.equal(entries.length, 2);
    assert.equal(
      entries.every((entry) => entry.activity === undefined),
      true,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
