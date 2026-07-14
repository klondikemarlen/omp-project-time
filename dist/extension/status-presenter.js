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
    "Commands: /project-time summary | /project-time billable | /project-time billable preview",
    "Tip: type /project-time followed by a space to choose a mode.",
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

function durationText(milliseconds) {
  const totalSeconds = Math.floor(Math.max(0, milliseconds) / 1_000);
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}
