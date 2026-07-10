import assert from "node:assert/strict"
import test from "node:test"

import { isTopLevelSession } from "../src/extension/session-classification.js"

test("treats sessions without a parent as top-level", () => {
  assert.equal(isTopLevelSession({ getHeader: () => ({}) }), true)
})

test("treats in-memory sessions as top-level", () => {
  assert.equal(isTopLevelSession({ getHeader: () => null }), true)
})


test("treats blank parent metadata as absent", () => {
  assert.equal(isTopLevelSession({ getHeader: () => ({ parentSession: "" }) }), true)
})
test("treats sessions with parent metadata as child sessions", () => {
  assert.equal(isTopLevelSession({ getHeader: () => ({ parentSession: "/tmp/parent.jsonl" }) }), false)
})
