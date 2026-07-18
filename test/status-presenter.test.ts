import assert from "node:assert/strict"
import test from "node:test"

import {
  dashboardText,
  historyText,
  reportText,
  summaryText,
} from "../src/extension/status-presenter.js"

test("presents selected activity and OMP session name", () => {
  const config = {
    activeWindowMinutes: 5,
    refreshIntervalSeconds: 15,
    label: "dev",
  }
  const state = { promptCount: 1, activeMilliseconds: 60_000, activity: "Code Review" }
  const entry = {
    id: "entry",
    sourceKind: "human_active" as const,
    project: "project-time",
    repositoryId: "repository-hash",
    activity: "Code Review",
    startAtMs: 0,
    endAtMs: 60_000,
    createdAtMs: 60_000,
  }

  assert.match(summaryText(state, config, "Project Time Audit", 60_000), /^Session: Project Time Audit/)
  assert.match(summaryText(state, config, "Project Time Audit", 60_000), /Activity: Code Review/)
  assert.equal(
    dashboardText(state, config, "project-time", "Project Time Audit"),
    [
      "Project: project-time · Active: 1m 0s (dev)",
      "Session: Project Time Audit",
      "Activity: Code Review",
      "/project-time summary | history | activity | report",
    ].join("\n"),
  )
  assert.match(historyText("project-time", state, config, [entry], []), /Code Review/)
  assert.doesNotMatch(historyText("project-time", state, config, [entry], []), /^Project Time history/)
  assert.match(
    reportText({
      sourceKind: "human_active",
      mode: "raw",
      ompActiveUnionMs: 60_000,
      entries: [{ ...entry, mode: "raw", durationMs: 60_000 }],
    }),
    /project-time: 1m 0s/,
  )
})
