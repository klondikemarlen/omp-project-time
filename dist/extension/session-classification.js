export function isTopLevelSession(sessionManager) {
  const header = sessionManager.getHeader();
  if (header === null) return true;
  return (
    typeof header.parentSession !== "string" ||
    header.parentSession.length === 0
  );
}
