export type GitContext = {
  head:
    | { kind: "branch"; name: string; source: "active_branch" }
    | { kind: "detached"; source: "active_branch" };
  worktree: { id: string; source: "local_git" };
};

export function parseGitContext(value: unknown): GitContext | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.head !== "object" || candidate.head === null)
    return undefined;
  if (typeof candidate.worktree !== "object" || candidate.worktree === null)
    return undefined;
  const head = candidate.head as Record<string, unknown>;
  const worktree = candidate.worktree as Record<string, unknown>;
  if (
    worktree.source !== "local_git" ||
    typeof worktree.id !== "string" ||
    !/^[a-f0-9]{64}$/u.test(worktree.id)
  )
    return undefined;
  if (head.source !== "active_branch") return undefined;
  if (head.kind === "detached")
    return {
      head: { kind: "detached", source: "active_branch" },
      worktree: { id: worktree.id, source: "local_git" },
    };
  if (
    head.kind !== "branch" ||
    typeof head.name !== "string" ||
    !isValidGitRefName(head.name)
  )
    return undefined;
  return {
    head: { kind: "branch", name: head.name, source: "active_branch" },
    worktree: { id: worktree.id, source: "local_git" },
  };
}

function isValidGitRefName(name: string): boolean {
  return (
    name.length > 0 &&
    !name.startsWith("/") &&
    !name.startsWith("-") &&
    !/[\x00-\x20\x7f~^:?*[\\]/u.test(name) &&
    !name.includes("..") &&
    !name.includes("@{") &&
    !name.endsWith("/") &&
    !name.endsWith(".") &&
    name !== "@" &&
    name
      .split("/")
      .every(
        (component) =>
          component.length > 0 &&
          !component.startsWith(".") &&
          !component.endsWith(".lock"),
      )
  );
}

export function gitContextKey(context: GitContext | undefined): string {
  if (context === undefined) return "";
  return JSON.stringify([
    context.head.kind,
    context.head.kind === "branch" ? context.head.name : "",
    context.head.source,
    context.worktree.id,
    context.worktree.source,
  ]);
}
