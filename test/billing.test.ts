import assert from "node:assert/strict"
import test from "node:test"
import Big from "big.js"

import * as billing from "../src/billing/index.js"
import * as billingShim from "../src/billing.js"

import { displayedDeveloperCost } from "../src/billing/displayed-developer-cost.js"
import { emptyDeveloperCostState } from "../src/billing/empty-developer-cost-state.js"
import { formatDeveloperCost } from "../src/billing/format-developer-cost.js"
import { parseDeveloperCostConfig } from "../src/billing/parse-developer-cost-config.js"
import { parseDeveloperCostState } from "../src/billing/parse-developer-cost-state.js"
import { recordDeveloperPrompt } from "../src/billing/record-developer-prompt.js"
import { refreshIntervalMs } from "../src/billing/refresh-interval-ms.js"
import { settleDeveloperCostState } from "../src/billing/settle-developer-cost-state.js"
import { windowRate } from "../src/billing/window-rate.js"

const config = parseDeveloperCostConfig()

const windowMs = config.activeWindowMinutes * 60 * 1000
const refreshMs = refreshIntervalMs(config)

test("exports billing modules through folder index and legacy shim", () => {
  assert.equal(billing.parseDeveloperCostConfig, parseDeveloperCostConfig)
  assert.equal(billing.recordDeveloperPrompt, recordDeveloperPrompt)
  assert.equal(billingShim.parseDeveloperCostConfig, parseDeveloperCostConfig)
  assert.equal(billingShim.recordDeveloperPrompt, recordDeveloperPrompt)
})

test("parses the default configuration", () => {
  assert.equal(config.monthlySalary, 6_500)
  assert.equal(config.hoursPerWeek, 40)
  assert.equal(config.weeksPerYear, 52)
  assert.equal(config.activeWindowMinutes, 5)
  assert.equal(config.refreshIntervalSeconds, 15)
  assert.equal(config.label, "dev")
})

test("defaults empty and invalid configuration values", () => {
  const defaultedConfig = parseDeveloperCostConfig({
    monthlySalary: 0,
    hoursPerWeek: -1,
    weeksPerYear: "",
    activeWindowMinutes: undefined,
    refreshIntervalSeconds: Number.NaN,
    label: "",
  })

  assert.equal(defaultedConfig.monthlySalary, 6_500)
  assert.equal(defaultedConfig.hoursPerWeek, 40)
  assert.equal(defaultedConfig.weeksPerYear, 52)
  assert.equal(defaultedConfig.activeWindowMinutes, 5)
  assert.equal(defaultedConfig.refreshIntervalSeconds, 15)
  assert.equal(defaultedConfig.label, "dev")
})

test("computes the configured refresh interval", () => {
  assert.equal(refreshIntervalMs(config), 15_000)
})

test("computes the five minute developer rate", () => {
  assert.equal(windowRate(config).toFixed(2), "3.13")
})

test("supports custom working weeks per year", () => {
  const customConfig = parseDeveloperCostConfig({
    monthlySalary: 6_500,
    hoursPerWeek: 40,
    weeksPerYear: 49,
    activeWindowMinutes: 5,
  })

  assert.equal(windowRate(customConfig).toFixed(2), "3.32")
})

test("stores cost as a decimal string", () => {
  const start = Date.UTC(2026, 0, 1, 12, 0, 0)
  const prompted = recordDeveloperPrompt(emptyDeveloperCostState(), start, config)
  const refreshed = settleDeveloperCostState(prompted, start + refreshMs, config)

  assert.equal(typeof refreshed.totalCost, "string")
  assert.equal(refreshed.totalCost, "0.15625")
})

test("accepts persisted numeric cost for old session entries", () => {
  const state = parseDeveloperCostState({
    totalCost: 3.125,
    activeStartAtMs: 1,
    activeUntilMs: 2,
    billedWindows: 1,
  })

  assert.equal(state?.totalCost, "3.125")
})

test("shows the active cost accumulated during one refresh interval", () => {
  const start = Date.UTC(2026, 0, 1, 12, 0, 0)
  const prompted = recordDeveloperPrompt(emptyDeveloperCostState(), start, config)
  const refreshed = settleDeveloperCostState(prompted, start + refreshMs, config)

  assert.equal(displayedDeveloperCost(refreshed).toFixed(2), "0.16")
})

test("bills one active window for a single prompt after five minutes", () => {
  const start = Date.UTC(2026, 0, 1, 12, 0, 0)
  const prompted = recordDeveloperPrompt(emptyDeveloperCostState(), start, config)
  const settled = settleDeveloperCostState(prompted, start + windowMs, config)

  assert.equal(settled.totalCost, "3.125")
  assert.equal(displayedDeveloperCost(settled).toFixed(2), "3.13")
  assert.equal(settled.activeStartAtMs, undefined)
  assert.equal(settled.activeUntilMs, undefined)
  assert.equal(settled.lastSettledAtMs, undefined)
})

test("keeps only continuous active time when activity stops before ten minutes", () => {
  const start = Date.UTC(2026, 0, 1, 12, 0, 0)
  const first = recordDeveloperPrompt(emptyDeveloperCostState(), start, config)
  const second = recordDeveloperPrompt(first, start + 4 * 60 * 1000, config)
  const nineMinutesLater = settleDeveloperCostState(second, start + 9 * 60 * 1000, config)
  const tenMinutesLater = settleDeveloperCostState(second, start + 10 * 60 * 1000, config)

  assert.equal(nineMinutesLater.totalCost, "5.625")
  assert.equal(tenMinutesLater.totalCost, "5.625")
})

test("bills two windows when prompts keep the session active for ten minutes", () => {
  const start = Date.UTC(2026, 0, 1, 12, 0, 0)
  const first = recordDeveloperPrompt(emptyDeveloperCostState(), start, config)
  const second = recordDeveloperPrompt(first, start + 4 * 60 * 1000, config)
  const third = recordDeveloperPrompt(second, start + 8 * 60 * 1000, config)
  const settled = settleDeveloperCostState(third, start + 10 * 60 * 1000, config)

  assert.equal(settled.totalCost, "6.25")
})

test("starts a new spell after more than five idle minutes", () => {
  const start = Date.UTC(2026, 0, 1, 12, 0, 0)
  const first = recordDeveloperPrompt(emptyDeveloperCostState(), start, config)
  const expired = settleDeveloperCostState(first, start + windowMs + 60 * 1000, config)
  const second = recordDeveloperPrompt(expired, start + 12 * 60 * 1000, config)
  const settled = settleDeveloperCostState(second, start + 17 * 60 * 1000, config)

  assert.equal(settled.totalCost, "6.25")
})

test("formats the accumulated cost", () => {
  assert.equal(formatDeveloperCost(Big("3.125")), "$3.13")
})
