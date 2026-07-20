import path from "node:path";
import { sanitizedProjectLabel } from "../infrastructure/sanitized-project-label.js";
import {
  normalizeRepositoryIdentity,
  parseRepositoryIdentity,
} from "../utils/parse-repository-identity.js";

export { normalizeRepositoryIdentity };
export function repositoryIdentityFromRemoteUrl(remoteUrl) {
  const urlIdentity = repositoryIdentityFromUrl(remoteUrl);
  if (urlIdentity !== undefined)
    return repositoryIdentity(urlIdentity.host, urlIdentity.path);
  const scpIdentity = repositoryIdentityFromScpUrl(remoteUrl);
  if (scpIdentity === undefined) return undefined;
  return repositoryIdentity(scpIdentity.host, scpIdentity.path);
}

function repositoryIdentityFromUrl(remoteUrl) {
  try {
    const parsedUrl = new URL(remoteUrl);
    const supportedProtocols = ["git:", "http:", "https:", "ssh:"];
    if (
      !supportedProtocols.includes(parsedUrl.protocol) ||
      parsedUrl.hostname === ""
    )
      return undefined;
    return {
      host: parsedUrl.hostname.toLowerCase(),
      path: parsedUrl.pathname.replace(/^\/+|\/+$/g, ""),
    };
  } catch {
    return undefined;
  }
}

function repositoryIdentityFromScpUrl(remoteUrl) {
  const match = remoteUrl.match(/^(?:[^@]+@)?([^:/]+):(.+)$/);
  if (match === null) return undefined;
  return { host: match[1].toLowerCase(), path: match[2] };
}

function repositoryIdentity(host, remotePath) {
  const normalizedPath = remotePath.replace(/\.git$/i, "");
  if (normalizedPath === "") return undefined;
  const value = `${host}/${normalizedPath}`;
  if (parseRepositoryIdentity(normalizeRepositoryIdentity(value)) === undefined)
    return undefined;
  return {
    value,
    project: sanitizedProjectLabel(path.basename(normalizedPath)),
  };
}

export default repositoryIdentityFromRemoteUrl;
