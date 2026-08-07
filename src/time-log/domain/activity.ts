export const MAX_ACTIVITY_LENGTH = 48

const activityPattern = /^[\p{L}\p{N}]+(?:[ -][\p{L}\p{N}]+)*$/u
const processOnlyGeneratedLabels: Record<string, true> = {
  complete: true,
  completed: true,
  completion: true,
  continue: true,
  continued: true,
  exit: true,
  "general work": true,
  "in progress": true,
  none: true,
  omp: true,
  "project exit": true,
  "project time": true,
  session: true,
  start: true,
  started: true,
  status: true,
  stop: true,
  stopped: true,
  unlabelled: true,
  unlabeled: true,
  working: true,
}

const processOnlyGeneratedWords: Record<string, true> = {
  commit: true,
  commits: true,
  committing: true,
  git: true,
  omp: true,
  unlabelled: true,
  unlabeled: true,
}

export function parseActivityLabel(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined

  const activity = value.trim()
  if (
    activity.length === 0 ||
    Array.from(activity).length > MAX_ACTIVITY_LENGTH
  ) {
    return undefined
  }

  return activityPattern.test(activity) ? activity : undefined
}

export function parseGeneratedActivityLabel(
  value: unknown,
): string | undefined {
  const activity = parseActivityLabel(value)
  const generatedActivity =
    activity ??
    (typeof value === "string" && value.includes(":")
      ? parseActivityLabel(value.slice(0, value.indexOf(":")))
      : undefined)
  if (generatedActivity === undefined) return undefined

  const normalizedActivity = generatedActivity.toLocaleLowerCase()
  if (processOnlyGeneratedLabels[normalizedActivity] === true) return undefined

  return normalizedActivity
    .split(/[ -]/u)
    .some((word) => processOnlyGeneratedWords[word] === true)
    ? undefined
    : generatedActivity
}
