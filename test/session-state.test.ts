import assert from "node:assert/strict"
import test from "node:test"

import { loadPersistedDeveloperCostState } from "../src/session-state.js"

test("returns an empty state when no persisted entry exists", () => {
  const state = loadPersistedDeveloperCostState([])

  assert.equal(state.totalCost, 0)
  assert.equal(state.billedWindows, 0)
})

test("loads the latest persisted developer cost entry", () => {
  const state = loadPersistedDeveloperCostState([
    {
      type: "custom",
      customType: "developer-cost-status.state",
      data: {
        totalCost: 1.23,
        billedWindows: 0,
      },
    },
    {
      type: "custom",
      customType: "developer-cost-status.state",
      data: {
        totalCost: 4.56,
        billedWindows: 1,
        activeStartAtMs: 1,
        activeUntilMs: 2,
      },
    },
  ])

  assert.equal(state.totalCost, 4.56)
  assert.equal(state.billedWindows, 1)
  assert.equal(state.activeStartAtMs, 1)
  assert.equal(state.activeUntilMs, 2)
})

test("loads legacy persisted state keyed by totalUsd", () => {
  const state = loadPersistedDeveloperCostState([
    {
      type: "custom",
      customType: "developer-cost-status.state",
      data: {
        totalUsd: 7.89,
        billedWindows: 2,
      },
    },
  ])

  assert.equal(state.totalCost, 7.89)
  assert.equal(state.billedWindows, 2)
})
