import assert from "node:assert/strict"
import test from "node:test"

import {
  emptyDeveloperCostState,
  formatDeveloperCost,
  parseDeveloperCostConfig,
  recordDeveloperPrompt,
  settleDeveloperCostState,
  windowRateUsd,
} from "../src/billing.js"

const parsed = parseDeveloperCostConfig({
  annualSalaryUsd: 100000,
  hoursPerWeek: 35,
  weeksPerYear: 49,
})

if (!parsed.ok) {
  throw new Error(parsed.error)
}

const config = parsed.config
const windowMs = config.activeWindowMinutes * 60 * 1000

test("parses the default five minute configuration", () => {
  assert.equal(config.activeWindowMinutes, 5)
  assert.equal(config.currencyCode, "USD")
  assert.equal(config.label, "Dev")
})

test("computes the five minute developer rate", () => {
  assert.equal(windowRateUsd(config).toFixed(2), "4.86")
})

test("bills one window for a single prompt after five minutes", () => {
  const start = Date.UTC(2026, 0, 1, 12, 0, 0)
  const prompted = recordDeveloperPrompt(emptyDeveloperCostState(), start, config)
  const settled = settleDeveloperCostState(prompted, start + windowMs, config)

  assert.equal(settled.totalUsd.toFixed(2), "4.86")
  assert.equal(settled.activeStartAtMs, undefined)
  assert.equal(settled.activeUntilMs, undefined)
})

test("keeps one billed window when activity stops before ten minutes", () => {
  const start = Date.UTC(2026, 0, 1, 12, 0, 0)
  const first = recordDeveloperPrompt(emptyDeveloperCostState(), start, config)
  const second = recordDeveloperPrompt(first, start + 4 * 60 * 1000, config)
  const nineMinutesLater = settleDeveloperCostState(second, start + 9 * 60 * 1000, config)
  const tenMinutesLater = settleDeveloperCostState(second, start + 10 * 60 * 1000, config)

  assert.equal(nineMinutesLater.totalUsd.toFixed(2), "4.86")
  assert.equal(tenMinutesLater.totalUsd.toFixed(2), "4.86")
})

test("bills two windows when prompts keep the session active for ten minutes", () => {
  const start = Date.UTC(2026, 0, 1, 12, 0, 0)
  const first = recordDeveloperPrompt(emptyDeveloperCostState(), start, config)
  const second = recordDeveloperPrompt(first, start + 4 * 60 * 1000, config)
  const third = recordDeveloperPrompt(second, start + 8 * 60 * 1000, config)
  const settled = settleDeveloperCostState(third, start + 10 * 60 * 1000, config)

  assert.equal(settled.totalUsd.toFixed(2), "9.72")
})

test("starts a new spell after more than five idle minutes", () => {
  const start = Date.UTC(2026, 0, 1, 12, 0, 0)
  const first = recordDeveloperPrompt(emptyDeveloperCostState(), start, config)
  const expired = settleDeveloperCostState(first, start + windowMs + 60 * 1000, config)
  const second = recordDeveloperPrompt(expired, start + 12 * 60 * 1000, config)
  const settled = settleDeveloperCostState(second, start + 17 * 60 * 1000, config)

  assert.equal(settled.totalUsd.toFixed(2), "9.72")
})

test("formats the accumulated cost as currency", () => {
  assert.equal(formatDeveloperCost(4.859086491739553, "USD"), "$4.86")
})
