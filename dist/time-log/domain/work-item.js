const workItemPattern =
  /\b(?:(issue)\s*#\s*|(pull\s*request|pr)\s*#\s*)(\d+)\b|github\.com\/([^/\s]+\/[^/\s]+)\/(issues|pull)\/(\d+)\b/giu;
const jiraPattern =
  /(?<![A-Za-z0-9_])([A-Z][A-Z0-9_]+-[1-9]\d*)(?![A-Za-z0-9])/gu;
function workItemMatches(prompt) {
  return [...prompt.matchAll(workItemPattern)].map((match) => ({
    kind:
      match[1]?.toLowerCase() === "issue" ||
      match[5]?.toLowerCase() === "issues"
        ? "issue"
        : "pull_request",
    number: Number(match[3] ?? match[6]),
    ...(match[4] === undefined
      ? {}
      : { repository: `github.com/${match[4].toLowerCase()}` }),
  }));
}

function uniqueWorkItems(prompt) {
  const matches = workItemMatches(prompt);
  return matches
    .filter(
      (match) =>
        match.repository !== undefined ||
        !matches.some(
          (candidate) =>
            candidate.kind === match.kind &&
            candidate.number === match.number &&
            candidate.repository !== undefined,
        ),
    )
    .filter(
      (match, index, candidates) =>
        candidates.findIndex(
          (candidate) =>
            candidate.kind === match.kind &&
            candidate.number === match.number &&
            candidate.repository === match.repository,
        ) === index,
    );
}

function uniqueJiraKeys(value) {
  return [
    ...new Set([...value.matchAll(jiraPattern)].map((match) => match[1])),
  ];
}

export function resolveBranchWorkItem(branch) {
  const keys = uniqueJiraKeys(branch);
  if (keys.length !== 1) {
    return { workItemAttribution: "unassigned" };
  }
  return {
    workItem: { kind: "jira", key: keys[0], source: "active_branch" },
    workItemAttribution: "active_branch",
  };
}

export function resolveWorkItemAssociation(prompt, currentWorkItem) {
  const workItems = uniqueWorkItems(prompt);
  const jiraKeys = uniqueJiraKeys(prompt.replace(workItemPattern, " "));
  if (workItems.length + jiraKeys.length === 0) {
    return currentWorkItem === undefined
      ? { workItemAttribution: "unassigned" }
      : { workItem: currentWorkItem, workItemAttribution: "carried_forward" };
  }
  if (workItems.length + jiraKeys.length !== 1)
    return { workItemAttribution: "ambiguous" };
  if (jiraKeys.length === 1) {
    return {
      workItem: { kind: "jira", key: jiraKeys[0], source: "user_provided" },
      workItemAttribution: "explicit_prompt",
    };
  }
  if (!Number.isSafeInteger(workItems[0]?.number) || workItems[0].number <= 0) {
    return currentWorkItem === undefined
      ? { workItemAttribution: "unassigned" }
      : { workItem: currentWorkItem, workItemAttribution: "carried_forward" };
  }
  return {
    workItem: { ...workItems[0], source: "user_provided" },
    workItemAttribution: "explicit_prompt",
  };
}

export function parseWorkItem(value) {
  if (typeof value !== "object" || value === null) return undefined;
  const candidate = value;
  if (candidate.kind === "jira") {
    if (
      typeof candidate.key !== "string" ||
      !/^[A-Z][A-Z0-9_]+-[1-9]\d*$/u.test(candidate.key)
    )
      return undefined;
    if (
      candidate.source !== "user_provided" &&
      candidate.source !== "active_branch"
    )
      return undefined;
    return { kind: "jira", key: candidate.key, source: candidate.source };
  }
  if (candidate.kind !== "issue" && candidate.kind !== "pull_request")
    return undefined;
  if (
    typeof candidate.number !== "number" ||
    !Number.isSafeInteger(candidate.number) ||
    candidate.number <= 0
  )
    return undefined;
  if (
    candidate.source !== "user_provided" &&
    candidate.source !== "linked_pull_request"
  )
    return undefined;
  if (
    candidate.repository !== undefined &&
    (typeof candidate.repository !== "string" ||
      !/^github\.com\/[a-z0-9_.-]+\/[a-z0-9_.-]+$/iu.test(candidate.repository))
  )
    return undefined;
  return {
    kind: candidate.kind,
    number: candidate.number,
    ...(candidate.repository === undefined
      ? {}
      : { repository: candidate.repository.toLowerCase() }),
    source: candidate.source,
  };
}

export function workItemKey(item) {
  if (item === undefined) return "";
  return item.kind === "jira"
    ? JSON.stringify([item.kind, item.key, item.source])
    : JSON.stringify([
        item.kind,
        item.number,
        item.repository ?? "",
        item.source,
      ]);
}

export function parseWorkItemAttribution(value) {
  return value === "explicit_prompt" ||
    value === "carried_forward" ||
    value === "active_branch" ||
    value === "linked_pull_request" ||
    value === "unassigned" ||
    value === "ambiguous" ||
    value === "legacy_unknown"
    ? value
    : undefined;
}
