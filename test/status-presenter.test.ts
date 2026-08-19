import assert from "node:assert/strict";
import test from "node:test";

import { dashboardText } from "../src/extension/status-presenter.js";

test("presents the live session dashboard", () => {
  const config = {
    activeWindowMinutes: 5,
    refreshIntervalSeconds: 15,
    label: "dev",
  };
  const state = {
    promptCount: 1,
    activeMilliseconds: 60_000,
    activity: "Code Review",
  };

  assert.equal(
    dashboardText(state, config, "project-time", "Project Time Audit"),
    [
      "Project: project-time · Active: 1m 0s (dev)",
      "Session: Project Time Audit",
      "Activity: Code Review",
      "/project-time entries",
    ].join("\n"),
  );
});
