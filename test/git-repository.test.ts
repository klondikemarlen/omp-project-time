import assert from "node:assert/strict"
import { execFile } from "node:child_process"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { promisify } from "node:util"
import test from "node:test"

import { resolveGitRepository } from "../src/infrastructure/git-repository.js"

const execFileAsync = promisify(execFile)

test("when origin resolves, records its normalized repository identity", async () => {
  // Arrange
  const directory = await mkdtemp(path.join(tmpdir(), "git-repository-test-"))

  try {
    await execFileAsync("git", ["init", "--quiet", directory])
    await execFileAsync("git", ["-C", directory, "remote", "add", "origin", "git@GitHub.com:Acme/Widget.git"])

    // Act
    const repository = await resolveGitRepository(directory)

    // Assert
    assert.equal(repository?.repositoryIdentity, "github.com/acme/widget")

    await execFileAsync("git", ["-C", directory, "remote", "set-url", "origin", "git@github.com:acme/widget%3Ftoken=secret"])
    const invalidRepository = await resolveGitRepository(directory)
    assert.equal(invalidRepository?.repositoryIdentity, undefined)
    assert.equal(invalidRepository?.project, "local-repository")
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test("when local worktrees share a repository without origin, their repository identity remains shared", async () => {
  // Arrange
  const directory = await mkdtemp(path.join(tmpdir(), "git-repository-worktree-test-"))
  const root = path.join(directory, "repository")
  const worktree = path.join(directory, "worktree")

  try {
    await execFileAsync("git", ["init", "--quiet", "-b", "main", root])
    await execFileAsync("git", ["-C", root, "config", "user.name", "Test"])
    await execFileAsync("git", ["-C", root, "config", "user.email", "test@example.com"])
    await writeFile(path.join(root, "tracked.txt"), "initial")
    await execFileAsync("git", ["-C", root, "add", "tracked.txt"])
    await execFileAsync("git", ["-C", root, "commit", "--quiet", "-m", "initial"])
    await execFileAsync("git", ["-C", root, "worktree", "add", "--quiet", "-b", "feature", worktree])

    // Act
    const primaryRepository = await resolveGitRepository(root)
    const linkedRepository = await resolveGitRepository(worktree)

    // Assert
    assert.equal(primaryRepository?.repositoryIdentity, undefined)
    assert.equal(linkedRepository?.repositoryIdentity, undefined)
    assert.equal(primaryRepository?.repositoryId, linkedRepository?.repositoryId)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
