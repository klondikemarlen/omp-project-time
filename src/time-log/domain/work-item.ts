export type WorkItem = {
  kind: "issue" | "pull_request"
  number: number
  repository?: string
  source: "user_provided"
}

export type WorkItemAttribution =
  | "explicit_prompt"
  | "carried_forward"
  | "unassigned"
  | "ambiguous"
  | "legacy_unknown"

export type WorkItemAssociation = {
  workItem?: WorkItem
  workItemAttribution: WorkItemAttribution
}

const workItemPattern = /\b(?:(issue)\s*#\s*|(pull\s*request|pr)\s*#\s*)(\d+)\b|github\.com\/([^/\s]+\/[^/\s]+)\/(issues|pull)\/(\d+)\b/giu

function workItemMatches(prompt: string) {
  return [...prompt.matchAll(workItemPattern)].map((match) => ({
    kind: match[1]?.toLowerCase() === "issue" || match[5]?.toLowerCase() === "issues"
      ? "issue" as const
      : "pull_request" as const,
    number: Number(match[3] ?? match[6]),
    ...(match[4] === undefined ? {} : { repository: `github.com/${match[4].toLowerCase()}` }),
  }))
}

function uniqueWorkItems(prompt: string) {
  const matches = workItemMatches(prompt)
  return matches
    .filter((match) =>
      match.repository !== undefined
      || !matches.some((candidate) =>
        candidate.kind === match.kind
        && candidate.number === match.number
        && candidate.repository !== undefined,
      ),
    )
    .filter((match, index, candidates) =>
      candidates.findIndex((candidate) =>
        candidate.kind === match.kind
        && candidate.number === match.number
        && candidate.repository === match.repository,
      ) === index,
    )
}

export function resolveWorkItemAssociation(
  prompt: string,
  currentWorkItem?: WorkItem,
): WorkItemAssociation {
  const workItems = uniqueWorkItems(prompt)
  if (workItems.length === 0) {
    return currentWorkItem === undefined
      ? { workItemAttribution: "unassigned" }
      : {
          workItem: currentWorkItem,
          workItemAttribution: "carried_forward",
        }
  }
  if (workItems.length !== 1) return { workItemAttribution: "ambiguous" }

  return {
    workItem: { ...workItems[0], source: "user_provided" },
    workItemAttribution: "explicit_prompt",
  }
}

export function parseWorkItem(value: unknown): WorkItem | undefined {
  if (typeof value !== "object" || value === null) return undefined
  const candidate = value as Record<string, unknown>
  if ((candidate.kind !== "issue" && candidate.kind !== "pull_request") || typeof candidate.number !== "number" || !Number.isSafeInteger(candidate.number) || candidate.number <= 0 || candidate.source !== "user_provided" || (candidate.repository !== undefined && (typeof candidate.repository !== "string" || !/^github\.com\/[a-z0-9_.-]+\/[a-z0-9_.-]+$/iu.test(candidate.repository)))) return undefined

  return { kind: candidate.kind, number: candidate.number, ...(candidate.repository === undefined ? {} : { repository: candidate.repository.toLowerCase() }), source: candidate.source }
}

export function parseWorkItemAttribution(
  value: unknown,
): WorkItemAttribution | undefined {
  return value === "explicit_prompt"
    || value === "carried_forward"
    || value === "unassigned"
    || value === "ambiguous"
    || value === "legacy_unknown"
    ? value
    : undefined
}
