import assert from "node:assert/strict"
import test from "node:test"

import { buildHumanActiveCoverage, buildReport } from "../src/time-log/domain/report.js"
import type { TimeLogEntry } from "../src/time-log/domain/model.js"

const minute = 60_000
const start = Date.UTC(2026, 0, 1)

function entry(
  overrides: Partial<TimeLogEntry> & Pick<TimeLogEntry, "sourceKind" | "repositoryId">,
): TimeLogEntry {
  return {
    ...overrides,
    id: "id",
    project: overrides.project ?? "project",
    sessionId: "session",
    startAtMs: overrides.startAtMs ?? start,
    endAtMs: overrides.endAtMs ?? start + minute,
    createdAtMs: start,
  }
}

test("raw reports retain full per-repository totals", () => {
  const entries = [
    entry({
      sourceKind: "human_active",
      repositoryId: "repo-alpha",
      project: "alpha",
      startAtMs: start,
      endAtMs: start + 5 * minute,
    }),
    entry({
      sourceKind: "human_active",
      repositoryId: "repo-beta",
      project: "beta",
      startAtMs: start + 2 * minute,
      endAtMs: start + 7 * minute,
    }),
  ]

  const raw = buildReport(entries, "human_active", "raw")

  assert.equal(raw.entries.length, 2)
  assert.equal(raw.ompActiveUnionMs, 7 * minute)
  const alpha = raw.entries.find((entry) => entry.repositoryId === "repo-alpha")
  const beta = raw.entries.find((entry) => entry.repositoryId === "repo-beta")
  assert.equal(alpha?.durationMs, 5 * minute)
  assert.equal(beta?.durationMs, 5 * minute)
})

test("split report divides concurrent time equally among active projects", () => {
  const entries = [
    entry({
      sourceKind: "human_active",
      repositoryId: "repo-alpha",
      project: "alpha",
      startAtMs: start,
      endAtMs: start + 5 * minute,
    }),
    entry({
      sourceKind: "human_active",
      repositoryId: "repo-beta",
      project: "beta",
      startAtMs: start + 2 * minute,
      endAtMs: start + 7 * minute,
    }),
  ]

  const split = buildReport(entries, "human_active", "split")

  assert.equal(split.ompActiveUnionMs, 7 * minute)
  const alpha = split.entries.find((e) => e.repositoryId === "repo-alpha")
  const beta = split.entries.find((e) => e.repositoryId === "repo-beta")

  // alpha alone for 2m, then shared 3m (alpha gets 1.5m), total 3.5m
  assert.equal(alpha?.durationMs, 3.5 * minute)
  // beta shared 3m (1.5m) + alone 2m, total 3.5m
  assert.equal(beta?.durationMs, 3.5 * minute)
})

test("weighted report divides concurrent time by caller-supplied weights", () => {
  const entries = [
    entry({
      sourceKind: "human_active",
      repositoryId: "repo-alpha",
      project: "alpha",
      startAtMs: start,
      endAtMs: start + 5 * minute,
    }),
    entry({
      sourceKind: "human_active",
      repositoryId: "repo-beta",
      project: "beta",
      startAtMs: start + 2 * minute,
      endAtMs: start + 7 * minute,
    }),
  ]

  const weighted = buildReport(entries, "human_active", "weighted", {
    "repo-alpha": 1,
    "repo-beta": 3,
  })

  assert.equal(weighted.ompActiveUnionMs, 7 * minute)
  const alpha = weighted.entries.find((e) => e.repositoryId === "repo-alpha")
  const beta = weighted.entries.find((e) => e.repositoryId === "repo-beta")

  // alpha alone 2m + shared 3m * 1/4 = 0.75m = 2.75m
  assert.equal(alpha?.durationMs, 2.75 * minute)
  // beta shared 3m * 3/4 = 2.25m + alone 2m = 4.25m
  assert.equal(beta?.durationMs, 4.25 * minute)
})

test("selects an exact project label without changing concurrent allocation", () => {
  const entries = [
    entry({
      sourceKind: "human_active",
      repositoryId: "repo-wrap",
      project: "old-wrap",
      startAtMs: start,
      endAtMs: start + minute,
    }),
    entry({
      sourceKind: "human_active",
      repositoryId: "repo-wrap",
      project: "wrap",
      startAtMs: start + minute,
      endAtMs: start + 2 * minute,
    }),
    entry({
      sourceKind: "human_active",
      repositoryId: "repo-other",
      project: "other",
      startAtMs: start + minute,
      endAtMs: start + 2 * minute,
    }),
  ]

  const raw = buildReport(entries, "human_active", "raw", undefined, "wrap")
  const split = buildReport(entries, "human_active", "split", undefined, "wrap")
  const weighted = buildReport(
    entries,
    "human_active",
    "weighted",
    { "repo-wrap": 3 },
    "wrap",
  )

  assert.deepEqual(raw.entries, [
    {
      mode: "raw",
      sourceKind: "human_active",
      repositoryId: "repo-wrap",
      project: "wrap",
      durationMs: minute,
    },
  ])
  assert.equal(raw.ompActiveUnionMs, minute)
  assert.equal(split.entries[0]?.durationMs, minute / 2)
  assert.equal(weighted.entries[0]?.durationMs, 0.75 * minute)
})

test("agent reports are separate from human reports", () => {
  const entries = [
    entry({
      sourceKind: "human_active",
      repositoryId: "repo-alpha",
      project: "alpha",
      startAtMs: start,
      endAtMs: start + 3 * minute,
    }),
    entry({
      sourceKind: "agent_turn_elapsed",
      repositoryId: "repo-alpha",
      project: "alpha",
      startAtMs: start,
      endAtMs: start + 5 * minute,
    }),
  ]

  const human = buildReport(entries, "human_active", "raw")
  const agent = buildReport(entries, "agent_turn_elapsed", "raw")

  assert.equal(human.entries.length, 1)
  assert.equal(human.entries[0].durationMs, 3 * minute)
  assert.equal(agent.entries.length, 1)
  assert.equal(agent.entries[0].durationMs, 5 * minute)
})

test("human-active coverage clips local-date intervals and reports overlap and gaps", () => {
  const entries = [
    entry({
      sourceKind: "human_active",
      repositoryId: "repo-wrap",
      project: "wrap",
      startAtMs: start,
      endAtMs: start + 5 * minute,
    }),
    entry({
      sourceKind: "human_active",
      repositoryId: "repo-wrap",
      project: "wrap",
      startAtMs: start + 2 * minute,
      endAtMs: start + 7 * minute,
    }),
    entry({
      sourceKind: "human_active",
      repositoryId: "repo-wrap",
      project: "wrap",
      startAtMs: start + 10 * minute,
      endAtMs: start + 12 * minute,
    }),
    entry({
      sourceKind: "human_active",
      repositoryId: "repo-other",
      project: "other",
      startAtMs: start,
      endAtMs: start + 20 * minute,
    }),
    entry({
      sourceKind: "agent_turn_elapsed",
      repositoryId: "repo-wrap",
      project: "wrap",
      startAtMs: start,
      endAtMs: start + 20 * minute,
    }),
  ]

  assert.deepEqual(
    buildHumanActiveCoverage(entries, "wrap", {
      startAtMs: start + minute,
      endAtMs: start + 11 * minute,
    }),
    [
      {
        sourceKind: "human_active",
        project: "wrap",
        rawTotalMs: 10 * minute,
        unionTotalMs: 7 * minute,
        concurrentOverlapMs: 3 * minute,
        span: { startAtMs: start + minute, endAtMs: start + 11 * minute },
        inactiveGaps: {
          totalMs: 3 * minute,
          intervals: [{ startAtMs: start + 7 * minute, endAtMs: start + 10 * minute }],
        },
      },
    ],
  )
})

test("weighted reports reject non-positive weights", () => {
  assert.throws(
    () =>
      buildReport(
        [entry({ sourceKind: "human_active", repositoryId: "repo-alpha" })],
        "human_active",
        "weighted",
        { "repo-alpha": 0 },
      ),
    /positive finite/,
  )
})
