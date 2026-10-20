import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import test from "node:test";

import { GitContextResolver } from "../src/infrastructure/git-context.js";
import type { GitRepository } from "../src/infrastructure/git-repository.js";

type CommandResult = { stdout: string };
type CommandRunner = (
  command: string,
  args: string[],
  cwd: string,
  timeoutMs: number,
) => Promise<CommandResult>;

const execFileAsync = promisify(execFile);

async function runGit(cwd: string, ...args: string[]) {
  return execFileAsync("git", ["-C", cwd, ...args], { timeout: 2_000 });
}

async function withRepository(
  check: (root: string, directory: string) => Promise<void>,
) {
  const directory = await mkdtemp(path.join(tmpdir(), "git-context-test-"));
  const root = path.join(directory, "repository");
  await mkdir(root);

  try {
    await execFileAsync("git", ["init", "--quiet", "-b", "main", root]);
    await runGit(root, "config", "user.name", "Test");
    await runGit(root, "config", "user.email", "test@example.com");
    await writeFile(path.join(root, "tracked.txt"), "initial");
    await runGit(root, "add", "tracked.txt");
    await runGit(root, "commit", "--quiet", "-m", "initial");
    await check(root, directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

function gitOnlyRunner(): CommandRunner {
  return async (command, args, cwd, timeoutMs) => {
    assert.equal(command, "git");
    return execFileAsync(command, args, { cwd, timeout: timeoutMs });
  };
}

function repository(repositoryIdentity?: string): GitRepository {
  return {
    project: "repository",
    repositoryId: "repository-id",
    ...(repositoryIdentity === undefined ? {} : { repositoryIdentity }),
  };
}

test("when HEAD is attached, records its branch and opaque worktree identity", async () => {
  // Arrange
  await withRepository(async (root, directory) => {
    // Act
    const resolution = await new GitContextResolver({
      runCommand: gitOnlyRunner(),
    }).resolve(root);

    // Assert
    assert.deepEqual(resolution.gitContext?.head, {
      kind: "branch",
      name: "main",
      source: "active_branch",
    });
    assert.match(resolution.gitContext?.worktree.id ?? "", /^[a-f0-9]{64}$/u);
    assert.equal(resolution.gitContext?.worktree.source, "local_git");
    assert.equal(JSON.stringify(resolution).includes(directory), false);
  });
});

test("when HEAD is detached, records detached context without guessing a work item", async () => {
  // Arrange
  await withRepository(async (root) => {
    const { stdout: commit } = await runGit(root, "rev-parse", "HEAD");
    await runGit(root, "checkout", "--quiet", "--detach", commit.trim());

    // Act
    const resolution = await new GitContextResolver({
      runCommand: gitOnlyRunner(),
    }).resolve(root, repository("github.com/acme/repository"));

    // Assert
    assert.deepEqual(resolution.gitContext?.head, {
      kind: "detached",
      source: "active_branch",
    });
    assert.equal(resolution.workItem, undefined);
    assert.equal(resolution.workItemAttribution, "unassigned");
  });
});

test("when one repository has two worktrees, their opaque identities remain distinct", async () => {
  // Arrange
  await withRepository(async (root, directory) => {
    const worktree = path.join(directory, "linked-worktree");
    await runGit(
      root,
      "worktree",
      "add",
      "--quiet",
      "-b",
      "feature/JIRA-42",
      worktree,
    );

    // Act
    const resolver = new GitContextResolver({ runCommand: gitOnlyRunner() });
    const primary = await resolver.resolve(root);
    const linked = await resolver.resolve(worktree);

    // Assert
    assert.notEqual(
      primary.gitContext?.worktree.id,
      linked.gitContext?.worktree.id,
    );
    assert.deepEqual(linked.workItem, {
      kind: "jira",
      key: "JIRA-42",
      source: "active_branch",
    });
    assert.equal(linked.workItemAttribution, "active_branch");
  });
});

test("when the branch changes, subsequent observations retain the new branch", async () => {
  // Arrange
  await withRepository(async (root) => {
    await runGit(root, "branch", "feature/JIRA-42");
    const resolver = new GitContextResolver({ runCommand: gitOnlyRunner() });

    // Act
    const initial = await resolver.resolve(root);
    await runGit(root, "switch", "--quiet", "feature/JIRA-42");
    const changed = await resolver.resolve(root);

    // Assert
    assert.equal(initial.gitContext?.head.kind, "branch");
    assert.equal(
      initial.gitContext?.head.kind === "branch"
        ? initial.gitContext.head.name
        : "",
      "main",
    );
    assert.equal(
      changed.gitContext?.head.kind === "branch"
        ? changed.gitContext.head.name
        : "",
      "feature/JIRA-42",
    );
    assert.deepEqual(changed.workItem, {
      kind: "jira",
      key: "JIRA-42",
      source: "active_branch",
    });
  });
});

test("when a linked PR lookup becomes unavailable, the verified association remains cached", async () => {
  // Arrange
  await withRepository(async (root) => {
    let linkedAvailable = true;
    const runner: CommandRunner = async (command, args, cwd, timeoutMs) => {
      if (command === "gh") {
        if (!linkedAvailable) return { stdout: "[]" };
        return {
          stdout: JSON.stringify([
            {
              number: 73,
              headRefName: "feature/JIRA-42",
              headRepositoryOwner: { login: "acme" },
              headRepository: { name: "repository" },
            },
          ]),
        };
      }
      return execFileAsync(command, args, { cwd, timeout: timeoutMs });
    };
    await runGit(root, "switch", "--quiet", "-c", "feature/JIRA-42");
    const resolver = new GitContextResolver({ runCommand: runner });
    const linkedRepository = repository("github.com/acme/repository");

    // Act
    const resolution = await resolver.resolve(root, linkedRepository);
    linkedAvailable = false;
    const repeated = await resolver.resolve(root, linkedRepository);

    // Assert
    assert.deepEqual(resolution.workItem, {
      kind: "pull_request",
      number: 73,
      repository: "github.com/acme/repository",
      source: "linked_pull_request",
    });
    assert.equal(resolution.workItemAttribution, "linked_pull_request");
    assert.deepEqual(repeated.workItem, resolution.workItem);
  });
});

test("when PR metadata is unlinked, from another repository, or ambiguous, preserves only the Jira branch reference", async () => {
  // Arrange
  await withRepository(async (root) => {
    await runGit(root, "switch", "--quiet", "-c", "feature/JIRA-42");
    const responses = [
      [],
      [
        {
          number: 3,
          headRefName: "feature/JIRA-42",
          headRepositoryOwner: { login: "fork" },
          headRepository: { name: "repository" },
        },
      ],
      [
        {
          number: 3,
          headRefName: "feature/JIRA-42",
          headRepositoryOwner: { login: "acme" },
          headRepository: { name: "repository" },
        },
        {
          number: 4,
          headRefName: "feature/JIRA-42",
          headRepositoryOwner: { login: "acme" },
          headRepository: { name: "repository" },
        },
      ],
    ];
    for (const response of responses) {
      const resolver = new GitContextResolver({
        runCommand: async (command, args, cwd, timeoutMs) =>
          command === "gh"
            ? { stdout: JSON.stringify(response) }
            : execFileAsync(command, args, { cwd, timeout: timeoutMs }),
      });
      // Act
      const resolution = await resolver.resolve(
        root,
        repository("github.com/acme/repository"),
      );
      // Assert
      assert.deepEqual(resolution.workItem, {
        kind: "jira",
        key: "JIRA-42",
        source: "active_branch",
      });
      assert.equal(resolution.workItemAttribution, "active_branch");
    }
  });
});

test("when gh is missing or unauthenticated, branch context remains usable without a guessed PR", async () => {
  // Arrange
  await withRepository(async (root) => {
    await runGit(root, "switch", "--quiet", "-c", "feature/JIRA-42");
    for (const error of [
      new Error("spawn gh ENOENT"),
      new Error("gh auth login required"),
    ]) {
      const resolver = new GitContextResolver({
        runCommand: async (command, args, cwd, timeoutMs) => {
          if (command === "gh") {
            throw error;
          }
          return execFileAsync(command, args, { cwd, timeout: timeoutMs });
        },
      });
      const linkedRepository = repository("github.com/acme/repository");

      // Act
      const first = await resolver.resolve(root, linkedRepository);
      const second = await resolver.resolve(root, linkedRepository);

      // Assert
      assert.deepEqual(first.workItem, {
        kind: "jira",
        key: "JIRA-42",
        source: "active_branch",
      });
      assert.deepEqual(second.workItem, first.workItem);
    }
  });
});

test("when the branch names a Jira ticket, resolves it without GitHub repository metadata", async () => {
  // Arrange
  await withRepository(async (root) => {
    await runGit(root, "switch", "--quiet", "-c", "feature/JIRA-42");
    // Act
    const resolution = await new GitContextResolver({
      runCommand: gitOnlyRunner(),
    }).resolve(root);

    // Assert
    assert.deepEqual(resolution.workItem, {
      kind: "jira",
      key: "JIRA-42",
      source: "active_branch",
    });
    assert.equal(resolution.workItemAttribution, "active_branch");
  });
});

test("when PR metadata becomes available after cache expiry, later observations record the verified PR", async () => {
  // Arrange
  await withRepository(async (root) => {
    await runGit(root, "switch", "--quiet", "-c", "feature/JIRA-42");
    let nowMs = 0;
    let available = false;
    const resolver = new GitContextResolver({
      now: () => nowMs,
      runCommand: async (command, args, cwd, timeoutMs) => {
        if (command !== "gh")
          return execFileAsync(command, args, { cwd, timeout: timeoutMs });
        return {
          stdout: JSON.stringify(
            available
              ? [
                  {
                    number: 73,
                    headRefName: "feature/JIRA-42",
                    headRepositoryOwner: { login: "acme" },
                    headRepository: { name: "repository" },
                  },
                ]
              : [],
          ),
        };
      },
    });
    const linkedRepository = repository("github.com/acme/repository");
    await resolver.resolve(root, linkedRepository);
    available = true;
    nowMs = 60_001;

    // Act
    const resolution = await resolver.resolve(root, linkedRepository);

    // Assert
    assert.deepEqual(resolution.workItem, {
      kind: "pull_request",
      number: 73,
      repository: "github.com/acme/repository",
      source: "linked_pull_request",
    });
  });
});
