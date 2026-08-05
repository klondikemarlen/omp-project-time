import assert from "node:assert/strict"
import test from "node:test"
import { resolveWorkItemAssociation } from "../src/time-log/domain/work-item.js"

test("resolves explicit, carried-forward, unassigned, and ambiguous work items", () => {
  const explicit = {
    kind: "pull_request" as const,
    number: 84,
    source: "user_provided" as const,
  }
  assert.deepEqual(resolveWorkItemAssociation("Review PR #84"), {
    workItem: explicit,
    workItemAttribution: "explicit_prompt",
  })
  assert.deepEqual(
    resolveWorkItemAssociation("Continue the review.", explicit),
    {
      workItem: explicit,
      workItemAttribution: "carried_forward",
    },
  )
  assert.deepEqual(
    resolveWorkItemAssociation("https://github.com/acme/app/issues/99"),
    {
      workItem: {
        kind: "issue",
        number: 99,
        repository: "github.com/acme/app",
        source: "user_provided",
      },
      workItemAttribution: "explicit_prompt",
    },
  )
  assert.deepEqual(resolveWorkItemAssociation("No ticket reference."), {
    workItemAttribution: "unassigned",
  })
  assert.deepEqual(
    resolveWorkItemAssociation("Review PR #999999999999999999999."),
    { workItemAttribution: "unassigned" },
  )
  assert.deepEqual(
    resolveWorkItemAssociation("Review PR #84 and PR #85.", explicit),
    { workItemAttribution: "ambiguous" },
  )
})
