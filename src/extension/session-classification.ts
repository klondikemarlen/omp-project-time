type SessionHeaderLike = {
  parentSession?: unknown
}

export type SessionManagerWithHeader = {
  getHeader(): SessionHeaderLike | null
}

export function isTopLevelSession(sessionManager: SessionManagerWithHeader): boolean {
  const header = sessionManager.getHeader()
  if (header === null) return true

  return typeof header.parentSession !== "string" || header.parentSession.length === 0
}

export default isTopLevelSession
