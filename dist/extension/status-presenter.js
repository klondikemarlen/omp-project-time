import {
  displayedDeveloperCost,
  formatDeveloperCost,
} from "../billing/index.js";

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
  const text = formatDeveloperCost(displayedDeveloperCost(state));
  return `${text} (${config.label})`;
}

export function dashboardText(state, config, project) {
  const billablePoliciesConfigured =
    config.billableTime.defaultClient !== undefined ||
    config.billableTime.clientsByRepository.size > 0;
  return [
    "Project Time",
    `Project: ${project ?? "unavailable"}`,
    `Developer meter: ${statusText(state, config)}`,
    `Billable policies: ${billablePoliciesConfigured ? "configured" : "not configured"}`,
    "Commands: /project-time summary | /project-time billable | /project-time billable preview | /project-time history",
    "Tip: type /project-time followed by a space to choose a mode.",
  ].join("\n");
}

export function historyText(
  project,
  state,
  config,
  billableTrackingEnabled,
  timeEntries,
  billableRecords,
) {
  const developerMilliseconds = timeEntries.reduce(
    (total, entry) => total + entry.endAtMs - entry.startAtMs,
    0,
  );
  const recentDeveloperTime = [...timeEntries]
    .sort((left, right) => right.endAtMs - left.endAtMs)
    .slice(0, 3)
    .map(
      (entry) =>
        `- ${timestampText(entry.endAtMs)}: ${durationText(entry.endAtMs - entry.startAtMs)}`,
    );
  const recentBillableRecords = [...billableRecords]
    .sort((left, right) => recordTimestamp(right) - recordTimestamp(left))
    .slice(0, 3)
    .map((record) => {
      const category =
        record.categoryLabel === undefined ? "" : ` / ${record.categoryLabel}`;
      return `- ${timestampText(recordTimestamp(record))}: ${record.sourceKind}${category} ${durationText(record.durationMs)}`;
    });
  const billableState = billableTrackingEnabled
    ? `enabled, ${billableRecords.length} records`
    : "disabled";
  return [
    "Project Time history",
    `Project: ${project ?? "unavailable"}`,
    `Developer meter: ${statusText(state, config)}`,
    `Developer time: ${timeEntries.length} intervals, ${durationText(developerMilliseconds)}`,
    `Billable tracking: ${billableState}`,
    `Recent developer time:${recentDeveloperTime.length === 0 ? " none" : `\n${recentDeveloperTime.join("\n")}`}`,
    `Recent billable records:${recentBillableRecords.length === 0 ? " none" : `\n${recentBillableRecords.join("\n")}`}`,
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
    `Cost: ${statusText(state, config)}`,
    `Active time: ${durationText(state.activeMilliseconds)}`,
    `Prompt count: ${state.promptCount}`,
    lastPrompt,
  ].join("\n");
}

function recordTimestamp(record) {
  return record.sourceKind === "attention"
    ? record.emittedAtMs
    : record.endedAtMs;
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
