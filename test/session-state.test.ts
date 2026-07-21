import assert from "node:assert/strict"
import test from "node:test"

import {
  loadPersistedProjectTimeState,
  PROJECT_TIME_STATE_ENTRY,
} from "../src/extension/session-state.js"

test("returns an empty state when no persisted entry exists", () => {
  const state = loadPersistedProjectTimeState([])

  assert.equal(state.promptCount, 0)
  assert.equal(state.activeMilliseconds, 0)
})

test("defaults attention metrics for a legacy persisted cost entry", () => {
  const state = loadPersistedProjectTimeState([
    {
      type: "custom",
      customType: PROJECT_TIME_STATE_ENTRY,
      data: { totalCost: "12.34" },
    },
  ])

  assert.equal(state.promptCount, 0)
  assert.equal(state.activeMilliseconds, 0)
})

test("loads the latest persisted project time state", () => {
  const state = loadPersistedProjectTimeState([
    {
      type: "custom",
      customType: PROJECT_TIME_STATE_ENTRY,
      data: {
        promptCount: 1,
      },
    },
    {
      type: "custom",
      customType: PROJECT_TIME_STATE_ENTRY,
      data: {
        promptCount: 7,
        activeMilliseconds: 890,
        activeStartAtMs: 1,
        activeUntilMs: 2,
        lastSettledAtMs: 1,
      },
    },
  ])

  assert.equal(state.promptCount, 7)
  assert.equal(state.activeMilliseconds, 890)
  assert.equal(state.activeStartAtMs, 1)
  assert.equal(state.activeUntilMs, 2)
  assert.equal(state.lastSettledAtMs, 1)
})

test("ignores invalid persisted state", () => {
  const state = loadPersistedProjectTimeState([
    {
      type: "custom",
      customType: PROJECT_TIME_STATE_ENTRY,
      data: {
        totalUsd: 7.89,
      },
    },
  ])

  assert.equal(state.promptCount, 0)
  assert.equal(state.activeMilliseconds, 0)
})

test("rejects malformed persisted narratives", () => {
  const state = loadPersistedProjectTimeState([
    {
      type: "custom",
      customType: PROJECT_TIME_STATE_ENTRY,
      data: {
        promptCount: 7,
        narrative: { text: " ", source: "generated" },
      },
    },
  ])

  assert.equal(state.promptCount, 0)
  assert.equal(state.narrative, undefined)
})
