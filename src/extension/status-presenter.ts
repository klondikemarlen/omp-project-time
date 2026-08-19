import type { ProjectTimeConfig } from "@/config/project-time-config.js";
import type { ExtensionContext } from "@/extension/types.js";
import type { ProjectTimeState } from "@/time-log/domain/state.js";
import type { TimeLogEntry } from "@/time-log/domain/model.js";

export const STATUS_KEY = "project-time";

export function updateStatus(
  ctx: ExtensionContext,
  state: ProjectTimeState,
  config: ProjectTimeConfig,
): void {
  ctx.ui.setStatus(
    STATUS_KEY,
    ctx.ui.theme.fg("dim", statusText(state, config)),
  );
}

export function clearStatus(ctx: ExtensionContext): void {
  ctx.ui.setStatus(STATUS_KEY, undefined);
}

export function statusText(
  state: ProjectTimeState,
  config: ProjectTimeConfig,
): string {
  return `${durationText(state.activeMilliseconds)} (${config.label})`;
}

export function dashboardText(
  state: ProjectTimeState,
  config: ProjectTimeConfig,
  project: string | undefined,
  sessionName: string | undefined,
): string {
  return [
    `Project: ${project ?? "unavailable"} · Active: ${statusText(state, config)}`,
    `Session: ${sessionName ?? "unnamed"}`,
    `Activity: ${activityText(state.activity)}`,
    "/project-time entries",
  ].join("\n");
}

export function projectDashboardText(
  project: string,
  entries: readonly TimeLogEntry[],
): string {
  const latest = [...entries].sort(
    (left, right) => right.endAtMs - left.endAtMs,
  )[0];

  return [
    `Project: ${project} · Ledger view`,
    `Last recorded: ${latest === undefined ? "none" : `${timestampText(latest.endAtMs)} — ${activityText(latest.activity)}`}`,
    `/project-time entries --project ${project}`,
  ].join("\n");
}

function timestampText(milliseconds: number): string {
  const timestamp = new Date(milliseconds);
  return Number.isNaN(timestamp.getTime())
    ? "unknown time"
    : timestamp.toISOString();
}

function activityText(activity: string | undefined): string {
  return activity ?? "unlabelled";
}

function durationText(milliseconds: number): string {
  const totalSeconds = Math.floor(Math.max(0, milliseconds) / 1_000);
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;

  return `${seconds}s`;
}
