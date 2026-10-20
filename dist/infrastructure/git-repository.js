import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { realpath } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { repositoryIdentityFromRemoteUrl } from "../infrastructure/repository-identity.js";
import { normalizeRepositoryIdentity } from "../utils/parse-repository-identity.js";

const execFileAsync = promisify(execFile);
export async function resolveGitRepository(cwd) {
  const rootPath = await repositoryRoot(cwd);
  if (rootPath === undefined) return undefined;
  const remoteUrl = await originRemoteUrl(rootPath);
  const remoteIdentity =
    remoteUrl === undefined
      ? undefined
      : repositoryIdentityFromRemoteUrl(remoteUrl);
  const identity =
    remoteIdentity ??
    localRepositoryIdentity(await repositoryCommonDirectory(rootPath));
  const repositoryId = createHash("sha256")
    .update(identity.value)
    .digest("hex");
  const repositoryIdentity =
    remoteIdentity === undefined
      ? undefined
      : normalizeRepositoryIdentity(remoteIdentity.value);
  return {
    project: identity.project,
    repositoryId,
    ...(repositoryIdentity === undefined ? {} : { repositoryIdentity }),
  };
}

async function repositoryRoot(cwd) {
  try {
    const result = await execFileAsync(
      "git",
      ["-C", cwd, "rev-parse", "--show-toplevel"],
      {
        timeout: 1_000,
      },
    );
    const rootPath = result.stdout.trim();
    return rootPath === "" ? undefined : rootPath;
  } catch {
    return undefined;
  }
}

async function originRemoteUrl(rootPath) {
  try {
    const result = await execFileAsync(
      "git",
      ["-C", rootPath, "remote", "get-url", "origin"],
      {
        timeout: 1_000,
      },
    );
    const remoteUrl = result.stdout.trim();
    return remoteUrl === "" ? undefined : remoteUrl;
  } catch {
    return undefined;
  }
}

async function repositoryCommonDirectory(rootPath) {
  try {
    const result = await execFileAsync(
      "git",
      ["-C", rootPath, "rev-parse", "--git-common-dir"],
      {
        timeout: 1_000,
      },
    );
    return await realpath(path.resolve(rootPath, result.stdout.trim()));
  } catch {
    return rootPath;
  }
}

function localRepositoryIdentity(commonDirectory) {
  const repositoryPath =
    path.basename(commonDirectory) === ".git"
      ? path.dirname(commonDirectory)
      : commonDirectory;
  return { project: "local-repository", value: repositoryPath };
}
