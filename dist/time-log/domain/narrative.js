const MAX_NARRATIVE_LENGTH = 2_000;
export function parseActivityNarrative(value) {
  if (typeof value !== "object" || value === null) return undefined;
  const candidate = value;
  const text = candidate.text;
  if (typeof text !== "string") return undefined;
  const normalizedText = text.trim();
  if (
    normalizedText.length === 0 ||
    normalizedText.length > MAX_NARRATIVE_LENGTH
  ) {
    return undefined;
  }
  if (
    candidate.source !== "generated" &&
    candidate.source !== "user_provided"
  ) {
    return undefined;
  }
  return { text: normalizedText, source: candidate.source };
}
