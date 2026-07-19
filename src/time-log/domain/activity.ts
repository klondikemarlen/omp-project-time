export const MAX_ACTIVITY_LENGTH = 48

const activityPattern = /^[\p{L}\p{N}]+(?:[ -][\p{L}\p{N}]+)*$/u

export function parseActivityLabel(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined

  const activity = value.trim()
  if (
    activity.length === 0
    || Array.from(activity).length > MAX_ACTIVITY_LENGTH
  ) {
    return undefined
  }

  return activityPattern.test(activity) ? activity : undefined
}

export function parseGeneratedActivityLabel(value: unknown): string | undefined {
  const activity = parseActivityLabel(value)
  if (activity !== undefined || typeof value !== "string") return activity

  const suffixIndex = value.indexOf(":")
  return suffixIndex === -1
    ? undefined
    : parseActivityLabel(value.slice(0, suffixIndex))
}
