import path from "node:path"

import { sanitizedProjectLabel } from "./sanitized-project-label.js"

type RepositoryIdentity = {
  project: string
  value: string
}

export function repositoryIdentityFromRemoteUrl(remoteUrl: string): RepositoryIdentity | undefined {
  const urlIdentity = repositoryIdentityFromUrl(remoteUrl)
  if (urlIdentity !== undefined) return repositoryIdentity(urlIdentity.host, urlIdentity.path)

  const scpIdentity = repositoryIdentityFromScpUrl(remoteUrl)
  if (scpIdentity === undefined) return undefined

  return repositoryIdentity(scpIdentity.host, scpIdentity.path)
}

function repositoryIdentityFromUrl(remoteUrl: string): { host: string; path: string } | undefined {
  try {
    const parsedUrl = new URL(remoteUrl)
    const supportedProtocols = ["git:", "http:", "https:", "ssh:"]
    if (!supportedProtocols.includes(parsedUrl.protocol) || parsedUrl.hostname === "") return undefined

    return {
      host: parsedUrl.hostname.toLowerCase(),
      path: parsedUrl.pathname.replace(/^\/+|\/+$/g, ""),
    }
  } catch {
    return undefined
  }
}

function repositoryIdentityFromScpUrl(remoteUrl: string): { host: string; path: string } | undefined {
  const match = remoteUrl.match(/^(?:[^@]+@)?([^:/]+):(.+)$/)
  if (match === null) return undefined

  return { host: match[1].toLowerCase(), path: match[2] }
}

function repositoryIdentity(host: string, remotePath: string): RepositoryIdentity | undefined {
  const normalizedPath = remotePath.replace(/\.git$/i, "")
  if (normalizedPath === "") return undefined

  return {
    value: `${host}/${normalizedPath}`,
    project: sanitizedProjectLabel(path.basename(normalizedPath)),
  }
}
