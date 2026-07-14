import assert from "node:assert/strict"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"

import { describeBillableSession } from "../src/billable-time/description-generator.js"
import { descriptionInputFromSession } from "../src/billable-time/domain/description-context.js"
import { BillableTimeRepository } from "../src/billable-time/infrastructure/ndjson-repository.js"

test("uses an explicit session title before generated context", async () => {
  const description = await describeBillableSession(
    { title: "Implement notification suppression", titleSource: "user" },
    [{ type: "message", message: { role: "user", content: "Secret raw request" } }],
    { sessionId: "session" },
  )

  assert.deepEqual(description, {
    description: "Implement notification suppression",
    source: "explicit",
  })
})

test("generates a description from a non-compacted session", async () => {
  let titleInput = ""
  const description = await describeBillableSession(
    null,
    [{ type: "message", message: { role: "user", content: "Implement notification suppression" } }],
    {
      sessionId: "session",
      generateTitle: async (input) => {
        titleInput = input
        return "Suppress duplicate notifications"
      },
    },
  )

  assert.match(titleInput, /Implement notification suppression/)
  assert.deepEqual(description, {
    description: "Suppress duplicate notifications",
    source: "generated",
  })
})

test("uses the provider-neutral fallback without a title generator", async () => {
  const description = await describeBillableSession(
    null,
    [{ type: "message", message: { role: "user", content: "Implement notification suppression" } }],
    { sessionId: "session" },
  )

  assert.deepEqual(description, {
    description: "Unlabeled billable work",
    source: "generated",
  })
})

test("persists only the generated description, not its source context", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "billable-description-"))
  const rawPrompt = "Secret raw request that must not be stored"

  try {
    const description = await describeBillableSession(
      null,
      [{ type: "message", message: { role: "user", content: rawPrompt } }],
      {
        sessionId: "session",
        generateTitle: async () => "Suppress duplicate notifications",
      },
    )
    const repository = new BillableTimeRepository(root)
    await repository.appendDescription({
      ...description,
      sessionId: "session",
      recordedAtMs: 1,
    })

    const persisted = await readFile(path.join(root, "session-descriptions.ndjson"), "utf8")
    assert.deepEqual(JSON.parse(persisted), {
      sessionId: "session",
      description: "Suppress duplicate notifications",
      source: "generated",
      recordedAtMs: 1,
    })
    assert.doesNotMatch(persisted, new RegExp(rawPrompt))
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("bounds long compaction summaries in generation context", () => {
  const summary = "x".repeat(500)
  const input = descriptionInputFromSession(
    [{ type: "compaction", summary }],
    summary,
  )

  assert.equal(input.includes(summary), false)
  assert.match(input, /x{240}/)
  assert.doesNotMatch(input, /x{241}/)
})
