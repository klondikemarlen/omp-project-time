import assert from "node:assert/strict"
import test from "node:test"

import {
  generateActivityNarrative,
  type ActivityNarrativeCompletion,
} from "../src/extension/activity-narrative-generator.js"
import type { ExtensionContext } from "../src/extension/types.js"

test("preserves detailed completion text for a source-grounded narrative", async () => {
  const requests: Parameters<ActivityNarrativeCompletion>[] = []
  const complete: ActivityNarrativeCompletion = async (...arguments_) => {
    requests.push(arguments_)
    return {
      stopReason: "stop",
      content: [{ type: "text", text: "Review PR #84: capture activity narratives.\nVerify typed persistence, legacy-log compatibility, and interval-duration access." }],
    }
  }
  const context = {
    cwd: "/project",
    ui: {
      notify() {},
      setStatus() {},
      theme: { fg(_color: string, text: string) { return text } },
    },
    sessionManager: {
      getSessionId: () => "session",
      getHeader: () => null,
      getEntries: () => [],
    },
    model: {} as NonNullable<ExtensionContext["model"]>,
    modelRegistry: {
      getApiKey: async () => "key",
      resolver: () => () => "key",
    },
  } as unknown as ExtensionContext

  const narrative = await generateActivityNarrative(
    "Review PR #84: Capture activity narratives for downstream worklogs, including typed persistence, legacy-log compatibility, and interval-duration access.",
    context,
    complete,
  )

  assert.deepEqual(narrative, {
    text: "Review PR #84: capture activity narratives.\nVerify typed persistence, legacy-log compatibility, and interval-duration access.",
    source: "generated",
  })
  assert.equal(requests.length, 1)
  assert.match(requests[0]?.[1].systemPrompt?.[0] ?? "", /up to 2,000 characters/)
  assert.equal(requests[0]?.[2].maxTokens, 1_500)
})
