import { summarizeTimeLogEntries } from "../time-log/domain/statistics.js";

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

export function statisticsText(entries, project, localStorageBytes) {
  const selectedEntries =
    project === undefined
      ? entries
      : entries.filter((entry) => entry.project === project);
  const statistics = summarizeTimeLogEntries(selectedEntries);
  const scope = project === undefined ? "all local projects" : project;
  const entrySummary = [
    `Entries: ${statistics.entryCount}`,
    `Projects: ${statistics.projects.length}`,
  ].join(" · ");
  const jsonCommand =
    project === undefined
      ? "project-time stats"
      : `project-time stats --project ${JSON.stringify(project)}`;
  const humanEvidence = statistics.sources.humanActive;
  const agentEvidence = statistics.sources.agentTurnElapsed;
  const humanSummary = [
    durationText(humanEvidence.observedMilliseconds),
    `${humanEvidence.entryCount} entries`,
  ].join(" · ");
  const agentSummary = [
    durationText(agentEvidence.observedMilliseconds),
    `${agentEvidence.entryCount} entries`,
  ].join(" · ");
  const range =
    statistics.firstStartAtMs === null
      ? "no evidence"
      : [
          timestampText(statistics.firstStartAtMs),
          timestampText(statistics.lastEndAtMs ?? statistics.firstStartAtMs),
        ].join("–");
  return [
    `Project Time statistics · ${scope}`,
    entrySummary,
    `Local storage: ${storageSizeText(localStorageBytes)} (${localStorageBytes} bytes)`,
    `Human evidence: ${humanSummary}`,
    `Agent evidence: ${agentSummary}`,
    `Range: ${range}`,
    `Complete JSON: ${jsonCommand}`,
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

function storageSizeText(bytes) {
  if (bytes < 1_024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  const unitIndex = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1_024)) - 1,
    units.length - 1,
  );
  const unitSize = 1_024 ** (unitIndex + 1);
  const roundedSize = Math.round((bytes / unitSize) * 10) / 10;
  return `${roundedSize} ${units[unitIndex]}`;
}
