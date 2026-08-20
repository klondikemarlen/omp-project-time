import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { ProjectTimeRuntime } from "../src/extension/runtime.js";
import type {
  BeforeAgentStartHandler,
  CommandCompletion,
  CommandHandler,
  ExtensionApi,
  ExtensionContext,
} from "../src/extension/types.js";

test("when exporting entries, opens complete evidence in the editor and writes full direct output", async () => {
  // Arrange
  const directory = await mkdtemp(path.join(tmpdir(), "project-time-runtime-"));
  const notices: Array<{ message: string; type?: string }> = [];
  const directOutputs: string[] = [];
  const evidenceViews: Array<{ title: string; content: string | undefined }> = [];
  const persistedActivities: unknown[] = [];
  const persistedNarratives: unknown[] = [];
  const persistedWorkItems: unknown[] = [];
  const persistedWorkItemAttributions: unknown[] = [];
  const generatedPrompts: string[] = [];
  const coverageStart = new Date(2026, 0, 1).getTime();
  const handlers: { beforeAgentStart?: BeforeAgentStartHandler } = {};
  let completionValues: string[] = [];
  let argumentCompletions:
    ((argumentPrefix: string) => CommandCompletion[] | null) | undefined;
  let handler: CommandHandler | undefined;
  const extensionApi: ExtensionApi = {
    registerCommand(_name, options) {
      handler = options.handler;
      argumentCompletions = options.getArgumentCompletions;
      completionValues = (argumentCompletions?.("") ?? []).map(
        ({ value }) => value,
      );
    },
    on(event, listener) {
      if (event === "before_agent_start") {
        // The event discriminator selects this ExtensionApi overload.
        const beforeAgentStartListener = listener as BeforeAgentStartHandler;
        handlers.beforeAgentStart = beforeAgentStartListener;
      }
    },
    appendEntry(_customType, data) {
      if (data !== null && typeof data === "object") {
        persistedActivities.push(
          "activity" in data ? data.activity : undefined,
        );
        persistedNarratives.push(
          "narrative" in data ? data.narrative : undefined,
        );
        persistedWorkItems.push("workItem" in data ? data.workItem : undefined);
        persistedWorkItemAttributions.push(
          "workItemAttribution" in data ? data.workItemAttribution : undefined,
        );
      } else {
        persistedActivities.push(undefined);
        persistedNarratives.push(undefined);
        persistedWorkItems.push(undefined);
        persistedWorkItemAttributions.push(undefined);
      }
    },
  };
  const context: ExtensionContext = {
    cwd: directory,
    ui: {
      notify(message, type) {
        notices.push({ message, type });
      },
      editor(title, prefill) {
        evidenceViews.push({ title, content: prefill });
        return Promise.resolve(undefined);
      },
      setStatus() {},
      theme: {
        fg(_color, text) {
          return text;
        },
      },
    },
    sessionManager: {
      getSessionId: () => "session",
      getSessionName: () => "Project Time Audit",
      getHeader: () => null,
      getEntries: () => [],
    },
  };

  try {
    await writeFile(
      path.join(directory, "time-log.json"),
      JSON.stringify({
        entries: [
          {
            id: "wrap-human",
            sourceKind: "human_active",
            project: "wrap",
            repositoryId: "wrap-repository",
            repositoryIdentity: "github.com/acme/wrap",
            sessionId: "session-wrap",
            activity: "Code Review",
            narrative: {
              text: "Review the evidence-export contract.",
              source: "generated",
            },
            workItem: {
              kind: "issue",
              number: 117,
              repository: "github.com/acme/wrap",
              source: "user_provided",
            },
            workItemAttribution: "explicit_prompt",
            startAtMs: coverageStart,
            endAtMs: coverageStart + 60_000,
            createdAtMs: coverageStart + 60_000,
          },
          {
            id: "wrap-agent",
            sourceKind: "agent_turn_elapsed",
            project: "wrap",
            repositoryId: "wrap-repository",
            repositoryIdentity: "github.com/acme/wrap",
            sessionId: "session-wrap",
            activity: "Tests",
            workItem: {
              kind: "issue",
              number: 117,
              repository: "github.com/acme/wrap",
              source: "user_provided",
            },
            workItemAttribution: "carried_forward",
            startAtMs: coverageStart + 60_000,
            endAtMs: coverageStart + 120_000,
            createdAtMs: coverageStart + 120_000,
          },
          {
            id: "other-human",
            sourceKind: "human_active",
            project: "other",
            repositoryId: "other-repository",
            activity: "Unrelated Work",
            startAtMs: coverageStart,
            endAtMs: coverageStart + 180_000,
            createdAtMs: coverageStart + 180_000,
          },
          {
            id: "multiword-human",
            sourceKind: "human_active",
            project: "Ice Fog Analytics",
            repositoryId: "ice-fog-repository",
            activity: "Planning",
            startAtMs: coverageStart + 240_000,
            endAtMs: coverageStart + 360_000,
            createdAtMs: coverageStart + 360_000,
          },
        ],
      }),
    );
    new ProjectTimeRuntime(extensionApi, {
      generateActivity: async (prompt) => {
        generatedPrompts.push(prompt);
        if (prompt === "initial failure") return {};
        if (prompt === "invalid output") return { activity: "Review #84" };
        if (prompt === "generator failure") throw new Error("unavailable");
        return {
          activity: "Code Review",
          narrative: {
            text: "Review PR #84, Capture activity narratives for downstream worklogs: verify typed persistence, legacy-log compatibility, and interval-duration access.",
            source: "generated",
          },
        };
      },
      timeLogPath: path.join(directory, "time-log.json"),
      writeEvidence(snapshot) {
        directOutputs.push(snapshot);
      },
    }).register();
    assert.deepEqual(completionValues, ["entries"]);
    assert.deepEqual(
      argumentCompletions?.("entries")?.map(({ value }) => value),
      ["entries"],
    );
    assert.deepEqual(
      argumentCompletions?.("--p")?.map(({ value }) => value),
      ["--project"],
    );
    assert.deepEqual(
      argumentCompletions?.("entries ")?.map(({ value }) => value),
      ["entries --project"],
    );
    assert.equal(argumentCompletions?.("garbage "), null);
    assert.equal(argumentCompletions?.("entries extra "), null);
    assert.equal(argumentCompletions?.("garbage --project "), null);
    assert.ok(handler);
    assert.ok(handlers.beforeAgentStart);

    // Act
    await handler("", context);
    // Assert
    assert.match(notices.at(-1)?.message ?? "", /Session: Project Time Audit/);

    assert.deepEqual(
      argumentCompletions?.("entries --project w")?.map(({ value }) => value),
      ["entries --project wrap"],
    );
    assert.deepEqual(
      argumentCompletions?.("--project ")?.map(({ value }) => value),
      ['--project "Ice Fog Analytics"', "--project other", "--project wrap"],
    );

    await handler("--project wrap", context);
    assert.match(notices.at(-1)?.message ?? "", /Project: wrap · Ledger view/);

    await handler("entries --project wrap", context);
    assert.equal(evidenceViews.at(-1)?.title, "Project Time evidence");
    const evidenceSnapshot = JSON.parse(evidenceViews.at(-1)?.content ?? "");
    assert.equal(evidenceSnapshot.format, "omp-project-time/evidence");
    assert.equal(evidenceSnapshot.version, 1);
    assert.deepEqual(evidenceSnapshot.entries, [
      {
        id: "wrap-human",
        sourceKind: "human_active",
        project: "wrap",
        repositoryId: "wrap-repository",
        repositoryIdentity: "github.com/acme/wrap",
        sessionId: "session-wrap",
        activity: "Code Review",
        narrative: {
          text: "Review the evidence-export contract.",
          source: "generated",
        },
        workItem: {
          kind: "issue",
          number: 117,
          repository: "github.com/acme/wrap",
          source: "user_provided",
        },
        workItemAttribution: "explicit_prompt",
        startAtMs: coverageStart,
        endAtMs: coverageStart + 60_000,
        createdAtMs: coverageStart + 60_000,
      },
      {
        id: "wrap-agent",
        sourceKind: "agent_turn_elapsed",
        project: "wrap",
        repositoryId: "wrap-repository",
        repositoryIdentity: "github.com/acme/wrap",
        sessionId: "session-wrap",
        activity: "Tests",
        workItem: {
          kind: "issue",
          number: 117,
          repository: "github.com/acme/wrap",
          source: "user_provided",
        },
        workItemAttribution: "carried_forward",
        startAtMs: coverageStart + 60_000,
        endAtMs: coverageStart + 120_000,
        createdAtMs: coverageStart + 120_000,
      },
    ]);
    assert.match(notices.at(-1)?.message ?? "", /Project: wrap · Ledger view/);
    context.hasUI = false;
    await handler("entries --project wrap", context);
    assert.deepEqual(directOutputs, [evidenceViews.at(-1)?.content]);
    context.hasUI = undefined;
    await handler("entries extra", context);
    assert.match(
      notices.at(-1)?.message ?? "",
      /Unknown Project Time command. Use entries/,
    );

    await handler("entries --project wrap --project other", context);
    assert.match(
      notices.at(-1)?.message ?? "",
      /Use --project NAME once at the end/,
    );

    await handlers.beforeAgentStart({ prompt: "initial failure" }, context);
    assert.deepEqual(generatedPrompts, ["initial failure"]);
    assert.equal(persistedActivities.at(-1), undefined);
    assert.equal(persistedWorkItemAttributions.at(-1), "unassigned");

    await handlers.beforeAgentStart(
      {
        prompt:
          "Review PR #84: Capture activity narratives for downstream worklogs, including typed persistence, legacy-log compatibility, and interval-duration access.",
      },
      context,
    );
    assert.deepEqual(generatedPrompts, [
      "initial failure",
      "Review PR #84: Capture activity narratives for downstream worklogs, including typed persistence, legacy-log compatibility, and interval-duration access.",
    ]);
    assert.equal(persistedActivities.at(-1), "Code Review");
    assert.deepEqual(persistedNarratives.at(-1), {
      text: "Review PR #84, Capture activity narratives for downstream worklogs: verify typed persistence, legacy-log compatibility, and interval-duration access.",
      source: "generated",
    });
    assert.equal(persistedWorkItemAttributions.at(-1), "explicit_prompt");

    await handlers.beforeAgentStart(
      { prompt: "Continue the review without a reference." },
      context,
    );
    assert.deepEqual(persistedWorkItems.at(-1), {
      kind: "pull_request",
      number: 84,
      source: "user_provided",
    });
    assert.equal(persistedWorkItemAttributions.at(-1), "carried_forward");

    await handlers.beforeAgentStart({ prompt: "Review PR #85." }, context);
    assert.deepEqual(persistedWorkItems.at(-1), {
      kind: "pull_request",
      number: 85,
      source: "user_provided",
    });
    assert.equal(persistedWorkItemAttributions.at(-1), "explicit_prompt");

    await handlers.beforeAgentStart(
      { prompt: "Review PR #84 and PR #85." },
      context,
    );
    assert.equal(persistedWorkItems.at(-1), undefined);
    assert.equal(persistedWorkItemAttributions.at(-1), "ambiguous");
    const persistedStateCount = persistedActivities.length;
    await handlers.beforeAgentStart({ prompt: "same activity" }, context);
    assert.equal(persistedActivities.length, persistedStateCount + 2);
    assert.equal(persistedActivities.at(-1), "Code Review");
    assert.equal(persistedWorkItemAttributions.at(-1), "unassigned");

    await handlers.beforeAgentStart({ prompt: "invalid output" }, context);
    assert.equal(persistedActivities.at(-1), undefined);

    await handlers.beforeAgentStart({ prompt: "generator failure" }, context);
    assert.equal(persistedActivities.at(-1), undefined);

    await handler("start", context);
    assert.match(
      notices.at(-1)?.message ?? "",
      /Unknown Project Time command. Use entries/,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
