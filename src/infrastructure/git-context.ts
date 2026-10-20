import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { realpath } from "node:fs/promises";
import { promisify } from "node:util";

import type { GitRepository } from "@/infrastructure/git-repository.js";
import {
  parseGitContext,
  type GitContext,
} from "@/time-log/domain/git-context.js";
import {
  resolveBranchWorkItem,
  type WorkItem,
  type WorkItemAttribution,
} from "@/time-log/domain/work-item.js";

const execFileAsync = promisify(execFile);
const gitTimeoutMs = 1_000;
const ghTimeoutMs = 2_000;

type CommandResult = { stdout: string };
type CommandRunner = (
  command: string,
  args: string[],
  cwd: string,
  timeoutMs: number,
) => Promise<CommandResult>;
type BranchHead = { kind: "branch"; name: string } | { kind: "detached" };
type PullRequest = {
  number: number;
  headRefName: string;
  headRepositoryOwner: { login: string } | null;
  headRepository: { name: string } | null;
};

type GitContextResolution = {
  gitContext?: GitContext;
  workItem?: WorkItem;
  workItemAttribution?: WorkItemAttribution;
};

type GitContextResolverOptions = {
  runCommand?: CommandRunner;
  now?: () => number;
};

/** Resolves private local Git context and an optional verified linked pull request. */
export class GitContextResolver {
  private readonly runCommand: CommandRunner;
  private readonly now: () => number;
  private readonly pullRequestCache = new Map<
    string,
    {
      expiresAtMs: number;
      result: Promise<WorkItem | undefined>;
    }
  >();

  constructor(options: GitContextResolverOptions = {}) {
    this.runCommand = options.runCommand ?? runCommand;
    this.now = options.now ?? Date.now;
  }

  async resolve(
    cwd: string,
    repository?: GitRepository,
  ): Promise<GitContextResolution> {
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

  private async resolveLinkedPullRequest(
    repositoryIdentity: string,
    cwd: string,
    worktreeId: string,
    branch: string,
  ): Promise<WorkItem | undefined> {
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

async function resolveLocalContext(
  run: CommandRunner,
  cwd: string,
): Promise<
  | {
      context: GitContext;
      branch: BranchHead;
    }
  | undefined
> {
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

async function gitPath(
  run: CommandRunner,
  cwd: string,
  option: string,
): Promise<string | undefined> {
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

async function activeBranch(
  run: CommandRunner,
  cwd: string,
): Promise<BranchHead | undefined> {
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

async function canonicalPath(value: string): Promise<string | undefined> {
  try {
    return await realpath(value);
  } catch {
    return undefined;
  }
}

async function findLinkedPullRequest(
  run: CommandRunner,
  repositoryIdentity: string,
  cwd: string,
  branch: string,
): Promise<WorkItem | undefined> {
  const separator = repositoryIdentity.indexOf("/");
  if (separator < 1) return undefined;
  const host = repositoryIdentity.slice(0, separator);
  const repository = repositoryIdentity.slice(separator + 1);
  if (host !== "github.com") return undefined;
  const [owner, name, ...extraSegments] = repository.split("/");
  if (owner === undefined || name === undefined || extraSegments.length > 0)
    return undefined;
  let result: CommandResult;
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

  let pullRequests: unknown;
  try {
    pullRequests = JSON.parse(result.stdout);
  } catch {
    return undefined;
  }
  if (!Array.isArray(pullRequests)) return undefined;

  const matching = pullRequests.filter(
    (value): value is PullRequest =>
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

function isPullRequest(value: unknown): value is PullRequest {
  if (typeof value !== "object" || value === null) return false;
  const pullRequest = value as Partial<PullRequest>;
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

async function runCommand(
  command: string,
  args: string[],
  cwd: string,
  timeoutMs: number,
): Promise<CommandResult> {
  return execFileAsync(command, args, {
    cwd,
    timeout: timeoutMs,
    maxBuffer: 1024 * 1024,
  });
}
