import assert from "node:assert/strict"
import test from "node:test"

import { loadPersistedDeveloperCostState } from "../src/extension/session-state.js"

test("returns an empty state when no persisted entry exists", () => {
  const state = loadPersistedDeveloperCostState([])

  assert.equal(state.totalCost, "0")
})

test("defaults attention metrics for a legacy persisted cost entry", () => {
  const state = loadPersistedDeveloperCostState([
    {
      type: "custom",
      customType: "developer-cost-status.state",
      data: { totalCost: "12.34" },
    },
  ])

  assert.equal(state.totalCost, "12.34")
  assert.equal(state.promptCount, 0)
  assert.equal(state.activeMilliseconds, 0)
})

test("loads the latest persisted developer cost entry", () => {
  const state = loadPersistedDeveloperCostState([
    {
      type: "custom",
      customType: "developer-cost-status.state",
      data: {
        totalCost: "1.23",
      },
    },
    {
      type: "custom",
      customType: "developer-cost-status.state",
      data: {
        totalCost: "4.56",
        promptCount: 7,
        activeMilliseconds: 890,
        activeStartAtMs: 1,
        activeUntilMs: 2,
        lastSettledAtMs: 1,
      },
    },
  ])

  assert.equal(state.totalCost, "4.56")
  assert.equal(state.promptCount, 7)
  assert.equal(state.activeMilliseconds, 890)
  assert.equal(state.activeStartAtMs, 1)
  assert.equal(state.activeUntilMs, 2)
  assert.equal(state.lastSettledAtMs, 1)
})

test("ignores invalid persisted state", () => {
  const state = loadPersistedDeveloperCostState([
    {
      type: "custom",
      customType: "developer-cost-status.state",
      data: {
        totalUsd: 7.89,
      },
    },
  ])

  assert.equal(state.totalCost, "0")
})
