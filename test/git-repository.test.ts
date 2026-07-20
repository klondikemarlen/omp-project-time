import assert from "node:assert/strict"
import { execFile } from "node:child_process"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { promisify } from "node:util"
import test from "node:test"

import { resolveGitRepository } from "../src/infrastructure/git-repository.js"

const execFileAsync = promisify(execFile)

test("resolves a normalized remote repository identity", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "git-repository-test-"))

  try {
    await execFileAsync("git", ["init", "--quiet", directory])
    await execFileAsync("git", ["-C", directory, "remote", "add", "origin", "git@GitHub.com:Acme/Widget.git"])

    const repository = await resolveGitRepository(directory)

    assert.equal(repository?.repositoryIdentity, "github.com/acme/widget")

    await execFileAsync("git", ["-C", directory, "remote", "set-url", "origin", "git@github.com:acme/widget%3Ftoken=secret"])
    const invalidRepository = await resolveGitRepository(directory)
    assert.equal(invalidRepository?.repositoryIdentity, undefined)
    assert.equal(invalidRepository?.project, "local-repository")
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
