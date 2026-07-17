export const STATUS_KEY = "project-time";
export function updateStatus(ctx, state, config) {
  ctx.ui.setStatus(
    STATUS_KEY,
    ctx.ui.theme.fg("dim", statusText(state, config)),
  );
}

export function clearStatus(ctx) {
  ctx.ui.setStatus(STATUS_KEY, undefined);
}

export function statusText(state, config) {
  return `${durationText(state.activeMilliseconds)} (${config.label})`;
}

export function dashboardText(state, config, project) {
  return [
    "Project Time",
    `Project: ${project ?? "unavailable"}`,
    `Current active: ${statusText(state, config)}`,
    `Repository attribution: ${repositoryAttributionStatus(config)}`,
    "Commands: /project-time summary | /project-time history | /project-time report",
    "Tip: type /project-time followed by a space to choose a mode.",
  ].join("\n");
}

export function historyText(
  project,
  state,
  config,
  humanEntries,
  agentEntries,
) {
  const humanMilliseconds = humanEntries.reduce(
    (total, entry) => total + entry.endAtMs - entry.startAtMs,
    0,
  );
  const agentMilliseconds = agentEntries.reduce(
    (total, entry) => total + entry.endAtMs - entry.startAtMs,
    0,
  );
  const recentHuman = recentEntries(humanEntries);
  const recentAgent = recentEntries(agentEntries);
  return [
    "Project Time history",
    `Project: ${project ?? "unavailable"}`,
    `Current active: ${statusText(state, config)}`,
    `Human active: ${humanEntries.length} intervals, ${durationText(humanMilliseconds)}`,
    `Agent elapsed: ${agentEntries.length} intervals, ${durationText(agentMilliseconds)}`,
    `Recent human active:${recentHuman.length === 0 ? " none" : `\n${recentHuman.join("\n")}`}`,
    `Recent agent elapsed:${recentAgent.length === 0 ? " none" : `\n${recentAgent.join("\n")}`}`,
  ].join("\n");
}

export function summaryText(state, config, sessionId, nowMs) {
  const lastPromptAtMs = state.lastPromptAtMs;
  let lastPrompt = "Last prompt: unavailable";
  if (lastPromptAtMs !== undefined) {
    const lastPromptAt = new Date(lastPromptAtMs);
    if (!Number.isNaN(lastPromptAt.getTime())) {
      lastPrompt = `Last prompt: ${durationText(nowMs - lastPromptAtMs)} ago (${lastPromptAt.toISOString()})`;
    }
  }
  return [
    "Project Time summary",
    `Session: ${sessionId}`,
    `Active time: ${durationText(state.activeMilliseconds)}`,
    `Prompt count: ${state.promptCount}`,
    lastPrompt,
  ].join("\n");
}

function repositoryAttributionStatus(config) {
  return config.repositoryAttribution.size > 0
    ? "configured"
    : "not configured";
}

function recentEntries(entries) {
  return [...entries]
    .sort((left, right) => right.endAtMs - left.endAtMs)
    .slice(0, 3)
    .map(
      (entry) =>
        `- ${timestampText(entry.endAtMs)}: ${durationText(entry.endAtMs - entry.startAtMs)}`,
    );
}

function timestampText(milliseconds) {
  const timestamp = new Date(milliseconds);
  return Number.isNaN(timestamp.getTime())
    ? "unknown time"
    : timestamp.toISOString();
}

function durationText(milliseconds) {
  const totalSeconds = Math.floor(Math.max(0, milliseconds) / 1_000);
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}
