import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { realpath } from "node:fs/promises";
import { promisify } from "node:util";
import { parseGitContext } from "../time-log/domain/git-context.js";
import { resolveBranchWorkItem } from "../time-log/domain/work-item.js";

const execFileAsync = promisify(execFile);
const gitTimeoutMs = 1_000;
const ghTimeoutMs = 2_000;
/** Resolves private local Git context and an optional verified linked pull request. */
export class GitContextResolver {
  runCommand;

  now;

  pullRequestCache = new Map();

  constructor(options = {}) {
    this.runCommand = options.runCommand ?? runCommand;
    this.now = options.now ?? Date.now;
  }

  async resolve(cwd, repository) {
    const localContext = await resolveLocalContext(this.runCommand, cwd);
    if (localContext === undefined) return {};
    const { context, branch } = localContext;
    if (branch.kind === "detached") {
      return {
        gitContext: context,
        workItemAttribution: "unassigned",
      };
    }
    const linkedPullRequest =
      repository?.repositoryIdentity === undefined
        ? undefined
        : await this.resolveLinkedPullRequest(
            repository.repositoryIdentity,
            cwd,
            context.worktree.id,
            branch.name,
          );
    if (linkedPullRequest !== undefined) {
      return {
        gitContext: context,
        workItem: linkedPullRequest,
        workItemAttribution: "linked_pull_request",
      };
    }
    const association = resolveBranchWorkItem(branch.name);
    return {
      gitContext: context,
      ...(association.workItem === undefined
        ? {}
        : { workItem: association.workItem }),
      workItemAttribution: association.workItemAttribution,
    };
  }

  async resolveLinkedPullRequest(repositoryIdentity, cwd, worktreeId, branch) {
    const cacheKey = `${repositoryIdentity}\0${worktreeId}\0${branch}`;
    const cachedPullRequest = this.pullRequestCache.get(cacheKey);
    if (
      cachedPullRequest !== undefined &&
      cachedPullRequest.expiresAtMs > this.now()
    ) {
      return cachedPullRequest.result;
    }
    const pullRequest = findLinkedPullRequest(
      this.runCommand,
      repositoryIdentity,
      cwd,
      branch,
    ).catch(() => undefined);
    this.pullRequestCache.set(cacheKey, {
      expiresAtMs: this.now() + 60_000,
      result: pullRequest,
    });
    return pullRequest;
  }
}

async function resolveLocalContext(run, cwd) {
  const gitDirectory = await gitPath(run, cwd, "--absolute-git-dir");
  if (gitDirectory === undefined) return undefined;
  const canonicalGitDirectory = await canonicalPath(gitDirectory);
  if (canonicalGitDirectory === undefined) return undefined;
  const branch = await activeBranch(run, cwd);
  if (branch === undefined) return undefined;
  const context = parseGitContext({
    head:
      branch.kind === "branch"
        ? { kind: "branch", name: branch.name, source: "active_branch" }
        : { kind: "detached", source: "active_branch" },
    worktree: {
      id: createHash("sha256").update(canonicalGitDirectory).digest("hex"),
      source: "local_git",
    },
  });
  if (context === undefined) return undefined;
  return { context, branch };
}

async function gitPath(run, cwd, option) {
  try {
    const result = await run(
      "git",
      ["-C", cwd, "rev-parse", option],
      cwd,
      gitTimeoutMs,
    );
    const value = result.stdout.trim();
    return value === "" ? undefined : value;
  } catch {
    return undefined;
  }
}

async function activeBranch(run, cwd) {
  try {
    const result = await run(
      "git",
      ["-C", cwd, "symbolic-ref", "--quiet", "HEAD"],
      cwd,
      gitTimeoutMs,
    );
    const reference = result.stdout.trim();
    if (!reference.startsWith("refs/heads/")) return undefined;
    return { kind: "branch", name: reference.slice("refs/heads/".length) };
  } catch (error) {
    // symbolic-ref exits 1 specifically for a non-symbolic (detached) HEAD.
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === 1
    ) {
      return { kind: "detached" };
    }
    return undefined;
  }
}

async function canonicalPath(value) {
  try {
    return await realpath(value);
  } catch {
    return undefined;
  }
}

async function findLinkedPullRequest(run, repositoryIdentity, cwd, branch) {
  const separator = repositoryIdentity.indexOf("/");
  if (separator < 1) return undefined;
  const host = repositoryIdentity.slice(0, separator);
  const repository = repositoryIdentity.slice(separator + 1);
  if (host !== "github.com") return undefined;
  const [owner, name, ...extraSegments] = repository.split("/");
  if (owner === undefined || name === undefined || extraSegments.length > 0)
    return undefined;
  let result;
  try {
    result = await run(
      "gh",
      [
        "pr",
        "list",
        "--repo",
        `${host}/${repository}`,
        "--state",
        "open",
        "--limit",
        "100",
        "--head",
        branch,
        "--json",
        "number,headRefName,headRepositoryOwner,headRepository",
      ],
      cwd,
      ghTimeoutMs,
    );
  } catch {
    return undefined;
  }
  let pullRequests;
  try {
    pullRequests = JSON.parse(result.stdout);
  } catch {
    return undefined;
  }
  if (!Array.isArray(pullRequests)) return undefined;
  const matching = pullRequests.filter(
    (value) =>
      isPullRequest(value) &&
      value.headRefName === branch &&
      value.headRepositoryOwner?.login.toLowerCase() === owner.toLowerCase() &&
      value.headRepository?.name.toLowerCase() === name.toLowerCase(),
  );
  if (matching.length !== 1) return undefined;
  return {
    kind: "pull_request",
    number: matching[0].number,
    repository: repositoryIdentity,
    source: "linked_pull_request",
  };
}

function isPullRequest(value) {
  if (typeof value !== "object" || value === null) return false;
  const pullRequest = value;
  return (
    Number.isSafeInteger(pullRequest.number) &&
    (pullRequest.number ?? 0) > 0 &&
    typeof pullRequest.headRefName === "string" &&
    (pullRequest.headRepositoryOwner === null ||
      (typeof pullRequest.headRepositoryOwner === "object" &&
        typeof pullRequest.headRepositoryOwner.login === "string")) &&
    (pullRequest.headRepository === null ||
      (typeof pullRequest.headRepository === "object" &&
        typeof pullRequest.headRepository.name === "string"))
  );
}

async function runCommand(command, args, cwd, timeoutMs) {
  return execFileAsync(command, args, {
    cwd,
    timeout: timeoutMs,
    maxBuffer: 1024 * 1024,
  });
}
