import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { parseGitContext } from "../src/time-log/domain/git-context.js";
import { parseTimeLogEntry } from "../src/time-log/domain/parse-entry.js";
import { recordAutomaticTimeLogEntry } from "../src/time-log/domain/record-automatic-entry.js";
import {
  parseProjectTimeState,
  serializeProjectTimeState,
  setProjectTimeActivity,
} from "../src/time-log/domain/state.js";
import { TimeLogLedger } from "../src/time-log/infrastructure/ledger.js";
import { formatTimeLogEvidence } from "../src/time-log/infrastructure/state-mapper.js";

const context = {
  head: {
    kind: "branch" as const,
    name: "feature/MY_PROJECT-123",
    source: "active_branch" as const,
  },
  worktree: { id: "a".repeat(64), source: "local_git" as const },
};

test("when a context is persisted in project state, parsing preserves it", () => {
  // Arrange
  const state = {
    promptCount: 2,
    activeMilliseconds: 1_000,
    gitContext: context,
  };

  // Act
  const parsed = parseProjectTimeState(serializeProjectTimeState(state));

  // Assert
  assert.deepEqual(parsed, state);
});

test("when activity is updated with an explicit absent context, prior context is cleared", () => {
  // Arrange
  const state = { promptCount: 1, activeMilliseconds: 0, gitContext: context };

  // Act
  const updated = setProjectTimeActivity(
    state,
    undefined,
    undefined,
    undefined,
    undefined,
    100,
    undefined,
  );

  // Assert
  assert.equal(updated.gitContext, undefined);
});

test("when an automatic entry includes context, parsing preserves it and rejects malformed context", () => {
  // Arrange
  const entry = {
    id: "entry-1",
    sourceKind: "human_active",
    project: "project",
    repositoryId: "repo",
    gitContext: context,
    startAtMs: 10,
    endAtMs: 20,
    createdAtMs: 30,
  };

  // Act
  const parsed = parseTimeLogEntry(entry);
  const malformed = parseTimeLogEntry({
    ...entry,
    gitContext: { ...context, worktree: { ...context.worktree, id: "path" } },
  });

  // Assert
  assert.deepEqual(parsed?.gitContext, context);
  assert.equal(malformed, undefined);
});

test("when a legacy entry omits Git context, it remains valid", () => {
  // Arrange
  const legacyEntry = {
    id: "legacy-entry",
    sourceKind: "human_active",
    project: "project",
    repositoryId: "repo",
    startAtMs: 10,
    endAtMs: 20,
    createdAtMs: 30,
  };

  // Act
  const parsed = parseTimeLogEntry(legacyEntry);

  // Assert
  assert.deepEqual(parsed, {
    ...legacyEntry,
    workItemAttribution: "unassigned",
  });
});

test("when a Git branch uses a valid leading underscore, its context remains valid", () => {
  // Arrange
  const branchContext = {
    ...context,
    head: { ...context.head, name: "_feature/JIRA-42" },
  };

  // Act
  const parsed = parseGitContext(branchContext);

  // Assert
  assert.deepEqual(parsed, branchContext);
});

test("when automatic recording receives malformed Git context, it rejects the entry", () => {
  // Arrange
  const input = {
    sourceKind: "human_active" as const,
    project: "project",
    repositoryId: "repo",
    sourceKey: "source",
    startAtMs: 10,
    endAtMs: 20,
    gitContext: {
      ...context,
      worktree: { ...context.worktree, id: "/private/path" },
    },
  };

  // Act
  const result = () => recordAutomaticTimeLogEntry([], input);

  // Assert
  assert.throws(result, /Git context is invalid/u);
});

test("when pending legacy JSON is imported into SQLite, context and Jira fields survive evidence export", async (t) => {
  // Arrange
  const directory = await mkdtemp(
    path.join(tmpdir(), "git-context-persistence-"),
  );
  t.after(() => rm(directory, { recursive: true, force: true }));
  const legacyJsonPath = path.join(directory, "time-log.json");
  const ledger = new TimeLogLedger(
    path.join(directory, "time-log.sqlite"),
    legacyJsonPath,
  );
  const legacyEntry = {
    id: "legacy-with-context",
    sourceKind: "human_active",
    project: "project",
    repositoryId: "repo",
    workItem: { kind: "jira", key: "MY_PROJECT-123", source: "active_branch" },
    workItemAttribution: "active_branch",
    gitContext: context,
    startAtMs: 10,
    endAtMs: 20,
    createdAtMs: 30,
  };
  const oldLegacyEntry = {
    id: "legacy-without-context",
    sourceKind: "human_active",
    project: "project",
    repositoryId: "repo",
    startAtMs: 20,
    endAtMs: 30,
    createdAtMs: 30,
  };
  await writeFile(
    legacyJsonPath,
    JSON.stringify({ entries: [legacyEntry, oldLegacyEntry] }),
  );

  // Act
  const importedEntries = await ledger.entries();
  const exported = JSON.parse(
    formatTimeLogEvidence(importedEntries, undefined),
  ) as {
    entries: Array<Record<string, unknown>>;
  };

  // Assert
  assert.deepEqual(exported.entries, [
    legacyEntry,
    { ...oldLegacyEntry, workItemAttribution: "unassigned" },
  ]);
});
