import assert from "node:assert/strict"
import test from "node:test"

import { createTimesheetEntries, timesheetPreview } from "../src/time-log/timesheet.js"

test("groups mapped active intervals by session and task", () => {
  const entries = createTimesheetEntries([
    {
      id: "first",
      project: "repo",
      repositoryId: "github.com/acme/repo",
      sessionId: "session",
      startAtMs: 0,
      endAtMs: 60_000,
      createdAtMs: 1,
      timesheet: {
        projectId: "acme",
        projectName: "Acme",
        categoryId: "development",
        categoryLabel: "Development",
      },
    },
    {
      id: "second",
      project: "repo",
      repositoryId: "github.com/acme/repo",
      sessionId: "session",
      startAtMs: 120_000,
      endAtMs: 180_000,
      createdAtMs: 2,
      timesheet: {
        projectId: "acme",
        projectName: "Acme",
        categoryId: "development",
        categoryLabel: "Development",
      },
    },
    {
      id: "unmapped",
      project: "other",
      repositoryId: "github.com/acme/other",
      sessionId: "other",
      startAtMs: 0,
      endAtMs: 60_000,
      createdAtMs: 3,
    },
  ], [{
    sessionId: "session",
    description: "Implement repository timesheets",
    source: "generated",
    recordedAtMs: 3,
  }])

  assert.deepEqual(entries, [{
    sessionId: "session",
    repositoryId: "github.com/acme/repo",
    projectId: "acme",
    projectName: "Acme",
    categoryId: "development",
    categoryLabel: "Development",
    task: "Implement repository timesheets",
    durationMs: 120_000,
    startedAtMs: 0,
    endedAtMs: 180_000,
  }])
  assert.deepEqual(JSON.parse(timesheetPreview(entries)), [{
    session_id: "session",
    repository_id: "github.com/acme/repo",
    project_id: "acme",
    project_name: "Acme",
    category_id: "development",
    category_label: "Development",
    task: "Implement repository timesheets",
    duration_ms: 120_000,
    started_at_ms: 0,
    ended_at_ms: 180_000,
  }])
})
