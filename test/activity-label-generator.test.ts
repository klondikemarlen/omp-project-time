import assert from "node:assert/strict"
import test from "node:test"

import type { generateSessionTitle } from "@oh-my-pi/pi-coding-agent/utils/title-generator"

import { generateActivity } from "../src/extension/activity-label-generator.js"
import type { ExtensionContext } from "../src/extension/types.js"

test("generates a status label and sanitized worklog narrative", async () => {
  const modelRegistry = {} as NonNullable<ExtensionContext["modelRegistry"]>
  const settings = {} as Parameters<typeof generateSessionTitle>[2]
  const context: ExtensionContext = {
    cwd: "/project",
    ui: {
      notify() {},
      setStatus() {},
      theme: { fg(_color, text) { return text } },
    },
    sessionManager: {
      getSessionId: () => "session",
      getHeader: () => null,
      getEntries: () => [],
    },
    modelRegistry,
  }
  const titleArguments: Parameters<typeof generateSessionTitle>[] = []
  const titleGenerator: typeof generateSessionTitle = async (...arguments_) => {
    titleArguments.push(arguments_)
    return "Code Review"
  }

  const activity = await generateActivity(
    "Review PR #84: Capture activity narratives for downstream worklogs, including typed persistence, legacy-log compatibility, and interval-duration access.",
    context,
    settings,
    titleGenerator,
    async () => ({
      text: "Review PR #84, Capture activity narratives for downstream worklogs: verify typed persistence, legacy-log compatibility, and interval-duration access.",
      source: "generated",
    }),
  )

  assert.deepEqual(activity, {
    activity: "Code Review",
    narrative: {
      text: "Review PR #84, Capture activity narratives for downstream worklogs: verify typed persistence, legacy-log compatibility, and interval-duration access.",
      source: "generated",
    },
  })
  assert.equal(titleArguments.length, 1)
  for (const arguments_ of titleArguments) {
    assert.equal(arguments_[0], "Review PR #84: Capture activity narratives for downstream worklogs, including typed persistence, legacy-log compatibility, and interval-duration access.")
    assert.equal(arguments_[1], modelRegistry)
    assert.equal(arguments_[2], settings)
    assert.equal(arguments_[3], "session")
  }
  assert.match(titleArguments[0]?.[6] ?? "", /1 to 48 Unicode letters or numbers/)
})
