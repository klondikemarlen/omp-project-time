import assert from "node:assert/strict"
import test from "node:test"

import {
  resolveBranchWorkItem,
  resolveWorkItemAssociation,
} from "../src/time-log/domain/work-item.js"

test("when an explicit prompt references a GitHub work item, explicit attribution is returned", () => {
  // Arrange
  const explicit = {
    kind: "pull_request" as const,
    number: 84,
    source: "user_provided" as const,
  }

  // Act
  const association = resolveWorkItemAssociation("Review PR #84")

  // Assert
  assert.deepEqual(association, {
    workItem: explicit,
    workItemAttribution: "explicit_prompt",
  })
})

test("when a prompt has no ticket reference, the existing association is carried forward", () => {
  // Arrange
  const current = {
    kind: "pull_request" as const,
    number: 84,
    source: "user_provided" as const,
  }

  // Act
  const association = resolveWorkItemAssociation("Continue the review.", current)

  // Assert
  assert.deepEqual(association, {
    workItem: current,
    workItemAttribution: "carried_forward",
  })
})

test("when a prompt contains a repository-qualified GitHub issue, repository identity is retained", () => {
  // Arrange
  const prompt = "https://github.com/acme/app/issues/99"

  // Act
  const association = resolveWorkItemAssociation(prompt)

  // Assert
  assert.deepEqual(association, {
    workItem: {
      kind: "issue",
      number: 99,
      repository: "github.com/acme/app",
      source: "user_provided",
    },
    workItemAttribution: "explicit_prompt",
  })
})

test("when a prompt references a Jira key, user-provided attribution is returned", () => {
  // Arrange
  const prompt = "Implement MY_PROJECT-123 in this change."

  // Act
  const association = resolveWorkItemAssociation(prompt)

  // Assert
  assert.deepEqual(association, {
    workItem: { kind: "jira", key: "MY_PROJECT-123", source: "user_provided" },
    workItemAttribution: "explicit_prompt",
  })
})

test("when a prompt contains multiple work item references, association is ambiguous", () => {
  // Arrange
  const prompt = "Review PR #84 and PROJ-123."

  // Act
  const association = resolveWorkItemAssociation(prompt)

  // Assert
  assert.deepEqual(association, { workItemAttribution: "ambiguous" })
})

test("when a prompt contains multiple Jira keys, association is ambiguous", () => {
  // Arrange
  const prompt = "Work on PROJ-123 and OTHER-45."

  // Act
  const association = resolveWorkItemAssociation(prompt)

  // Assert
  assert.deepEqual(association, { workItemAttribution: "ambiguous" })
})

test("when no reference is present, association is unassigned", () => {
  // Arrange
  const prompt = "No ticket reference."

  // Act
  const association = resolveWorkItemAssociation(prompt)

  // Assert
  assert.deepEqual(association, { workItemAttribution: "unassigned" })
})

test("when a Jira key appears in a branch, active-branch provenance is returned", () => {
  // Arrange
  const branch = "feature/PROJ-123-add-support"

  // Act
  const association = resolveBranchWorkItem(branch)

  // Assert
  assert.deepEqual(association, {
    workItem: { kind: "jira", key: "PROJ-123", source: "active_branch" },
    workItemAttribution: "active_branch",
  })
})

test("when a branch contains multiple Jira keys, no work item is guessed", () => {
  // Arrange
  const branch = "PROJ-123-OTHER-45"

  // Act
  const association = resolveBranchWorkItem(branch)

  // Assert
  assert.deepEqual(association, { workItemAttribution: "unassigned" })
})

test("when a branch has no Jira key, association is unassigned", () => {
  // Arrange
  const branch = "feature/no-ticket"

  // Act
  const association = resolveBranchWorkItem(branch)

  // Assert
  assert.deepEqual(association, { workItemAttribution: "unassigned" })
})

test("when a GitHub reference includes an oversized number, association remains unassigned", () => {
  // Arrange
  const prompt = "Review PR #999999999999999999999."

  // Act
  const association = resolveWorkItemAssociation(prompt)

  // Assert
  assert.deepEqual(association, { workItemAttribution: "unassigned" })
})

test("when a GitHub URL contains a Jira-shaped repository name, retains its explicit GitHub reference", () => {
  // Arrange
  const prompt = "Review https://github.com/acme/APP-42/pull/73"

  // Act
  const association = resolveWorkItemAssociation(prompt)

  // Assert
  assert.deepEqual(association, {
    workItem: {
      kind: "pull_request",
      number: 73,
      repository: "github.com/acme/app-42",
      source: "user_provided",
    },
    workItemAttribution: "explicit_prompt",
  })
})
