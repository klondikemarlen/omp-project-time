import assert from "node:assert/strict"
import test from "node:test"

import {
  MAX_ACTIVITY_LENGTH,
  parseActivityLabel,
  parseGeneratedActivityLabel,
} from "../src/time-log/domain/activity.js"

test("accepts only concise activity labels", () => {
  assert.equal(parseActivityLabel("Code Review"), "Code Review")
  assert.equal(parseActivityLabel("release-prep"), "release-prep")
  assert.equal(parseActivityLabel("Review #84"), undefined)
  assert.equal(parseActivityLabel("src/report.ts"), undefined)
  assert.equal(parseActivityLabel("x".repeat(MAX_ACTIVITY_LENGTH + 1)), undefined)
  const nonBmpLetters = "\u{10400}".repeat(MAX_ACTIVITY_LENGTH)
  assert.equal(parseActivityLabel(nonBmpLetters), nonBmpLetters)
  assert.equal(parseActivityLabel(`${nonBmpLetters}\u{10400}`), undefined)
})

test("keeps generated labels coarse without accepting invalid manual labels", () => {
  assert.equal(
    parseGeneratedActivityLabel("Pull Request Review: Code Quality"),
    "Pull Request Review",
  )
  assert.equal(parseGeneratedActivityLabel("Review #84"), undefined)
})
