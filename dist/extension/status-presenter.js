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

export function dashboardText(state, config, project, sessionName) {
  return [
    `Project: ${project ?? "unavailable"} · Active: ${statusText(state, config)}`,
    `Session: ${sessionName ?? "unnamed"}`,
    `Activity: ${activityText(state.activity)}`,
    "/project-time summary | history | report",
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
    `Project: ${project ?? "unavailable"}`,
    `Current active: ${statusText(state, config)}`,
    `Human active: ${humanEntries.length} intervals, ${durationText(humanMilliseconds)}`,
    `Agent elapsed: ${agentEntries.length} intervals, ${durationText(agentMilliseconds)}`,
    `Recent human active:${recentHuman.length === 0 ? " none" : `\n${recentHuman.join("\n")}`}`,
    `Recent agent elapsed:${recentAgent.length === 0 ? " none" : `\n${recentAgent.join("\n")}`}`,
  ].join("\n");
}

export function summaryText(state, config, sessionName, nowMs) {
  const lastPromptAtMs = state.lastPromptAtMs;
  let lastPrompt = "Last prompt: unavailable";
  if (lastPromptAtMs !== undefined) {
    const lastPromptAt = new Date(lastPromptAtMs);
    if (!Number.isNaN(lastPromptAt.getTime())) {
      lastPrompt = `Last prompt: ${durationText(nowMs - lastPromptAtMs)} ago (${lastPromptAt.toISOString()})`;
    }
  }
  return [
    `Session: ${sessionName ?? "unnamed"}`,
    `Activity: ${activityText(state.activity)}`,
    `Active time: ${durationText(state.activeMilliseconds)}`,
    `Prompt count: ${state.promptCount}`,
    lastPrompt,
  ].join("\n");
}

export function reportText(report) {
  const entries = [...report.entries].sort(
    (left, right) => right.durationMs - left.durationMs,
  );
  return [
    `${sourceKindText(report.sourceKind)} — ${allocationText(report.mode)}`,
    `OMP-active: ${durationText(report.ompActiveUnionMs)}`,
    `Projects:${entries.length === 0 ? " none" : `\n${entries.map((entry) => `- ${entry.project}: ${durationText(entry.durationMs)}`).join("\n")}`}`,
  ].join("\n");
}

function recentEntries(entries) {
  return [...entries]
    .sort((left, right) => right.endAtMs - left.endAtMs)
    .slice(0, 3)
    .map(
      (entry) =>
        `- ${timestampText(entry.endAtMs)}: ${durationText(entry.endAtMs - entry.startAtMs)} — ${activityText(entry.activity)}`,
    );
}

function timestampText(milliseconds) {
  const timestamp = new Date(milliseconds);
  return Number.isNaN(timestamp.getTime())
    ? "unknown time"
    : timestamp.toISOString();
}

function activityText(activity) {
  return activity ?? "unlabelled";
}

function sourceKindText(sourceKind) {
  return sourceKind === "human_active"
    ? "Human collaboration"
    : "Agent execution";
}

function allocationText(mode) {
  if (mode === "raw") return "full repository time";
  if (mode === "split") return "equal split";
  return "weighted split";
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
