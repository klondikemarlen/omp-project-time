export function parseIanaTimeZone(value) {
  if (typeof value !== "string" || value.trim() === "") return undefined;
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: value,
    }).resolvedOptions().timeZone;
  } catch {
    return undefined;
  }
}
