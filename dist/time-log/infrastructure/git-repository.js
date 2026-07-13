import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { promisify } from "node:util";
import { repositoryIdentityFromRemoteUrl } from "../../time-log/domain/repository-identity.js";

const execFileAsync = promisify(execFile);
export async function resolveGitRepository(cwd) {
  const rootPath = await repositoryRoot(cwd);
  if (rootPath === undefined) return undefined;
  const remoteUrl = await originRemoteUrl(rootPath);
  const remoteIdentity =
    remoteUrl === undefined
      ? undefined
      : repositoryIdentityFromRemoteUrl(remoteUrl);
  const identity = remoteIdentity ?? localRepositoryIdentity(rootPath);
  const repositoryId = createHash("sha256")
    .update(identity.value)
    .digest("hex");
  return { project: identity.project, repositoryId };
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

function localRepositoryIdentity(rootPath) {
  return { project: "local-repository", value: rootPath };
}

export default resolveGitRepository;
