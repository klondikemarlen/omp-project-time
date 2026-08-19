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
    "/project-time entries",
  ].join("\n");
}

export function projectDashboardText(project, entries) {
  const latest = [...entries].sort(
    (left, right) => right.endAtMs - left.endAtMs,
  )[0];
  return [
    `Project: ${project} · Ledger view`,
    `Last recorded: ${latest === undefined ? "none" : `${timestampText(latest.endAtMs)} — ${activityText(latest.activity)}`}`,
    `/project-time entries --project ${project}`,
  ].join("\n");
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

function durationText(milliseconds) {
  const totalSeconds = Math.floor(Math.max(0, milliseconds) / 1_000);
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}
