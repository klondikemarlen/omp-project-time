import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { TimeLogLedger } from "../src/time-log/infrastructure/ledger.js";

async function temporaryLedger(t: test.TestContext) {
  const directory = await mkdtemp(
    path.join(tmpdir(), "ledger-migration-views-"),
  );
  t.after(() => rm(directory, { recursive: true, force: true }));
  const databasePath = path.join(directory, "time-log.sqlite");
  const legacyJsonPath = path.join(directory, "time-log.json");
  return {
    ledger: new TimeLogLedger(databasePath, legacyJsonPath),
    databasePath,
    legacyJsonPath,
  };
}

test("after a failed import is repaired, prune preview includes pending legacy evidence", async (t) => {
  // Arrange
  const { ledger, legacyJsonPath } = await temporaryLedger(t);
  await writeFile(legacyJsonPath, "{invalid");
  await assert.rejects(ledger.entries(), /Time log state is unreadable/);
  await writeFile(
    legacyJsonPath,
    JSON.stringify({
      entries: [
        {
          id: "completed",
          sourceKind: "human_active",
          project: "Example",
          repositoryId: "example-repository",
          startAtMs: 1_000,
          endAtMs: 2_000,
          createdAtMs: 2_000,
        },
        {
          id: "crossing",
          sourceKind: "agent_turn_elapsed",
          project: "Example",
          repositoryId: "example-repository",
          startAtMs: 2_000,
          endAtMs: 4_000,
          createdAtMs: 4_000,
        },
      ],
    }),
  );

  // Act
  const preview = await ledger.pruneEntriesEndingAtOrBefore(2_500, true);

  // Assert
  assert.deepEqual(preview, {
    matchingEntryCount: 1,
    deletedEntryCount: 0,
    retainedEntryCount: 2,
  });
});

test("after a failed import is repaired, project completion includes pending legacy projects", async (t) => {
  // Arrange
  const { ledger, legacyJsonPath } = await temporaryLedger(t);
  await writeFile(legacyJsonPath, "{invalid");
  await assert.rejects(ledger.entries(), /Time log state is unreadable/);
  await writeFile(
    legacyJsonPath,
    JSON.stringify({
      entries: [
        {
          id: "legacy-entry",
          sourceKind: "human_active",
          project: "Example",
          repositoryId: "example-repository",
          startAtMs: 1_000,
          endAtMs: 2_000,
          createdAtMs: 2_000,
        },
      ],
    }),
  );

  // Act
  const projects = ledger.projectNames();

  // Assert
  assert.deepEqual(projects, ["Example"]);
});

test("when a pending legacy import is invalid, prune preview rejects it", async (t) => {
  // Arrange
  const { ledger, legacyJsonPath } = await temporaryLedger(t);
  await ledger.entries();
  await writeFile(legacyJsonPath, "{invalid");

  // Act / Assert
  await assert.rejects(
    ledger.pruneEntriesEndingAtOrBefore(2_500, true),
    /Time log state is unreadable/,
  );
});

test("when pending legacy evidence conflicts with recorded evidence, prune preview rejects it", async (t) => {
  // Arrange
  const { ledger, legacyJsonPath } = await temporaryLedger(t);
  await ledger.recordAutomatic({
    sourceKind: "human_active",
    project: "Example",
    repositoryId: "example-repository",
    sourceKey: "current-session",
    startAtMs: 3_000,
    endAtMs: 4_000,
  });
  await writeFile(legacyJsonPath, JSON.stringify({ entries: [] }));

  // Act / Assert
  await assert.rejects(
    ledger.pruneEntriesEndingAtOrBefore(2_500, true),
    /already initialized and cannot import legacy state/,
  );
});

test("after migrated evidence is pruned, previews do not resurrect its legacy backup", async (t) => {
  // Arrange
  const { ledger, legacyJsonPath } = await temporaryLedger(t);
  await writeFile(
    legacyJsonPath,
    JSON.stringify({
      entries: [
        {
          id: "legacy-entry",
          sourceKind: "human_active",
          project: "Example",
          repositoryId: "example-repository",
          startAtMs: 1_000,
          endAtMs: 2_000,
          createdAtMs: 2_000,
        },
      ],
    }),
  );
  await ledger.pruneEntriesEndingAtOrBefore(2_500, false);

  // Act
  const preview = await ledger.pruneEntriesEndingAtOrBefore(2_500, true);
  const projects = ledger.projectNames();

  // Assert
  assert.deepEqual(preview, {
    matchingEntryCount: 0,
    deletedEntryCount: 0,
    retainedEntryCount: 0,
  });
  assert.deepEqual(projects, []);
});

test("when previewing pending legacy evidence, database and backup bytes remain unchanged", async (t) => {
  // Arrange
  const { ledger, databasePath, legacyJsonPath } = await temporaryLedger(t);
  await ledger.entries();
  await writeFile(
    legacyJsonPath,
    JSON.stringify({
      entries: [
        {
          id: "legacy-entry",
          sourceKind: "human_active",
          project: "Example",
          repositoryId: "example-repository",
          startAtMs: 1_000,
          endAtMs: 2_000,
          createdAtMs: 2_000,
        },
      ],
    }),
  );
  const databaseBefore = await readFile(databasePath);
  const legacyBefore = await readFile(legacyJsonPath);

  // Act
  ledger.projectNames();
  await ledger.pruneEntriesEndingAtOrBefore(2_500, true);

  // Assert
  const databaseAfter = await readFile(databasePath);
  const legacyAfter = await readFile(legacyJsonPath);
  assert.deepEqual(databaseAfter, databaseBefore);
  assert.deepEqual(legacyAfter, legacyBefore);
});
