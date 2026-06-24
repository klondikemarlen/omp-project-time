import assert from "node:assert/strict"
import test from "node:test"

import {
  displayedDeveloperCost,
  emptyDeveloperCostState,
  formatDeveloperCost,
  parseDeveloperCostConfig,
  recordDeveloperPrompt,
  refreshIntervalMs,
  settleDeveloperCostState,
  windowRate,
} from "../src/billing.js"

const config = parseDeveloperCostConfig()

const windowMs = config.activeWindowMinutes * 60 * 1000

test("parses the default configuration", () => {
  assert.equal(config.monthlySalary, 6_500)
  assert.equal(config.hoursPerWeek, 40)
  assert.equal(config.activeWindowMinutes, 5)
  assert.equal(config.refreshIntervalSeconds, 5)
  assert.equal(config.label, "dev")
})

test("computes the configured refresh interval", () => {
  assert.equal(refreshIntervalMs(config), 5_000)
})

test("computes the five minute developer rate", () => {
  assert.equal(windowRate(config).toFixed(2), "3.13")
})

test("shows a live partial value before a window settles", () => {
  const start = Date.UTC(2026, 0, 1, 12, 0, 0)
  const prompted = recordDeveloperPrompt(emptyDeveloperCostState(), start, config)
  const halfway = displayedDeveloperCost(prompted, start + windowMs / 2, config)

  assert.equal(halfway.toFixed(2), "1.56")
})

test("bills one window for a single prompt after five minutes", () => {
  const start = Date.UTC(2026, 0, 1, 12, 0, 0)
  const prompted = recordDeveloperPrompt(emptyDeveloperCostState(), start, config)
  const settled = settleDeveloperCostState(prompted, start + windowMs, config)

  assert.equal(settled.totalCost.toFixed(2), "3.13")
  assert.equal(settled.activeStartAtMs, undefined)
  assert.equal(settled.activeUntilMs, undefined)
})

test("keeps one billed window when activity stops before ten minutes", () => {
  const start = Date.UTC(2026, 0, 1, 12, 0, 0)
  const first = recordDeveloperPrompt(emptyDeveloperCostState(), start, config)
  const second = recordDeveloperPrompt(first, start + 4 * 60 * 1000, config)
  const nineMinutesLater = settleDeveloperCostState(second, start + 9 * 60 * 1000, config)
  const tenMinutesLater = settleDeveloperCostState(second, start + 10 * 60 * 1000, config)

  assert.equal(nineMinutesLater.totalCost.toFixed(2), "3.13")
  assert.equal(tenMinutesLater.totalCost.toFixed(2), "3.13")
})

test("bills two windows when prompts keep the session active for ten minutes", () => {
  const start = Date.UTC(2026, 0, 1, 12, 0, 0)
  const first = recordDeveloperPrompt(emptyDeveloperCostState(), start, config)
  const second = recordDeveloperPrompt(first, start + 4 * 60 * 1000, config)
  const third = recordDeveloperPrompt(second, start + 8 * 60 * 1000, config)
  const settled = settleDeveloperCostState(third, start + 10 * 60 * 1000, config)

  assert.equal(settled.totalCost.toFixed(2), "6.25")
})

test("starts a new spell after more than five idle minutes", () => {
  const start = Date.UTC(2026, 0, 1, 12, 0, 0)
  const first = recordDeveloperPrompt(emptyDeveloperCostState(), start, config)
  const expired = settleDeveloperCostState(first, start + windowMs + 60 * 1000, config)
  const second = recordDeveloperPrompt(expired, start + 12 * 60 * 1000, config)
  const settled = settleDeveloperCostState(second, start + 17 * 60 * 1000, config)

  assert.equal(settled.totalCost.toFixed(2), "6.25")
})

test("formats the accumulated cost", () => {
  assert.equal(formatDeveloperCost(3.125), "$3.13")
})
