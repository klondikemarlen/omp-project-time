import assert from "node:assert/strict"
import test from "node:test"

import { generateActivity } from "../src/extension/activity-label-generator.js"
import type {
  ActivityGenerationContext,
  ExtensionContext,
} from "../src/extension/types.js"

test("generates a repository-contextual label and sanitized worklog narrative", async () => {
  const modelRegistry = {} as NonNullable<ExtensionContext["modelRegistry"]>
  const context: ExtensionContext = {
    cwd: "/project",
    ui: {
      notify() {},
      setStatus() {},
      theme: {
        fg(_color, text) {
          return text
        },
      },
    },
    sessionManager: {
      getSessionId: () => "session",
      getHeader: () => null,
      getEntries: () => [],
    },
    modelRegistry,
  }
  const activityContext: ActivityGenerationContext = {
    project: "omp-project-time",
    repositoryIdentity: "github.com/klondikemarlen/omp-project-time",
  }
  const labelPrompts: string[] = []
  const labelContexts: ActivityGenerationContext[] = []
  const titleGenerator = async (
    prompt: string,
    _ctx: ExtensionContext,
    generatedContext: ActivityGenerationContext,
  ) => {
    labelPrompts.push(prompt)
    labelContexts.push(generatedContext)
    return "omp-project-time | Code Review"
  }

  const activity = await generateActivity(
    "Review PR #84: Capture activity narratives for downstream worklogs, including typed persistence, legacy-log compatibility, and interval-duration access.",
    context,
    activityContext,
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
  assert.deepEqual(labelContexts, [activityContext])
  assert.equal(labelPrompts.length, 1)
  assert.equal(labelPrompts[0], "Review PR #84: Capture activity narratives for downstream worklogs, including typed persistence, legacy-log compatibility, and interval-duration access.")

  const contextMismatch = await generateActivity(
    "Review activity labels.",
    context,
    activityContext,
    async () => "other-project | Code Review",
    async () => undefined,
  )
  assert.deepEqual(contextMismatch, {})

  const processLabel = await generateActivity(
    "Review activity labels.",
    context,
    activityContext,
    async () => "omp-project-time | Project Time",
    async () => undefined,
  )
  assert.deepEqual(processLabel, {})
})
