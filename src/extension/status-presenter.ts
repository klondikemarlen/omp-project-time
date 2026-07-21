import type { ProjectTimeConfig } from "@/config/project-time-config.js"
import type { ExtensionContext } from "@/extension/types.js"
import type { ProjectTimeState } from "@/time-log/domain/state.js"
import type { TimeLogEntry } from "@/time-log/domain/model.js"
import type { Report } from "@/time-log/domain/report.js"

export const STATUS_KEY = "project-time"

export function updateStatus(
  ctx: ExtensionContext,
  state: ProjectTimeState,
  config: ProjectTimeConfig,
): void {
  ctx.ui.setStatus(STATUS_KEY, ctx.ui.theme.fg("dim", statusText(state, config)))
}

export function clearStatus(ctx: ExtensionContext): void {
  ctx.ui.setStatus(STATUS_KEY, undefined)
}

export function statusText(
  state: ProjectTimeState,
  config: ProjectTimeConfig,
): string {
  return `${durationText(state.activeMilliseconds)} (${config.label})`
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
    "/project-time summary | history | report",
  ].join("\n")
}

export function historyText(
  project: string | undefined,
  state: ProjectTimeState,
  config: ProjectTimeConfig,
  humanEntries: readonly TimeLogEntry[],
  agentEntries: readonly TimeLogEntry[],
): string {
  const humanMilliseconds = humanEntries.reduce(
    (total, entry) => total + entry.endAtMs - entry.startAtMs,
    0,
  )
  const agentMilliseconds = agentEntries.reduce(
    (total, entry) => total + entry.endAtMs - entry.startAtMs,
    0,
  )
  const recentHuman = recentEntries(humanEntries)
  const recentAgent = recentEntries(agentEntries)

  return [
    `Project: ${project ?? "unavailable"}`,
    `Current active: ${statusText(state, config)}`,
    `Human active: ${humanEntries.length} intervals, ${durationText(humanMilliseconds)}`,
    `Agent elapsed: ${agentEntries.length} intervals, ${durationText(agentMilliseconds)}`,
    `Recent human active:${recentHuman.length === 0 ? " none" : `\n${recentHuman.join("\n")}`}`,
    `Recent agent elapsed:${recentAgent.length === 0 ? " none" : `\n${recentAgent.join("\n")}`}`,
  ].join("\n")
}

export function summaryText(
  state: ProjectTimeState,
  config: ProjectTimeConfig,
  sessionName: string | undefined,
  nowMs: number,
): string {
  const lastPromptAtMs = state.lastPromptAtMs
  let lastPrompt = "Last prompt: unavailable"

  if (lastPromptAtMs !== undefined) {
    const lastPromptAt = new Date(lastPromptAtMs)

    if (!Number.isNaN(lastPromptAt.getTime())) {
      lastPrompt = `Last prompt: ${durationText(nowMs - lastPromptAtMs)} ago (${lastPromptAt.toISOString()})`
    }
  }

  return [
    `Session: ${sessionName ?? "unnamed"}`,
    `Activity: ${activityText(state.activity)}`,
    `Active time: ${durationText(state.activeMilliseconds)}`,
    `Prompt count: ${state.promptCount}`,
    lastPrompt,
  ].join("\n")
}

export function reportText(report: Report): string {
  const entries = [...report.entries].sort(
    (left, right) => right.durationMs - left.durationMs,
  )

  return [
    `${sourceKindText(report.sourceKind)} — ${allocationText(report.mode)}`,
    `OMP-active: ${durationText(report.ompActiveUnionMs)}`,
    `Projects:${entries.length === 0 ? " none" : `\n${entries.map((entry) => `- ${entry.project}: ${durationText(entry.durationMs)}`).join("\n")}`}`,
  ].join("\n")
}



function recentEntries(entries: readonly TimeLogEntry[]): string[] {
  return [...entries]
    .sort((left, right) => right.endAtMs - left.endAtMs)
    .slice(0, 3)
    .map((entry) => {
      const summary = `- ${timestampText(entry.endAtMs)}: ${durationText(entry.endAtMs - entry.startAtMs)} — ${activityText(entry.activity)}`
      return entry.narrative === undefined
        ? summary
        : `${summary}\n${entry.narrative.text.split("\n").map((line) => `  ${line}`).join("\n")}`
    })
}

function timestampText(milliseconds: number): string {
  const timestamp = new Date(milliseconds)
  return Number.isNaN(timestamp.getTime()) ? "unknown time" : timestamp.toISOString()
}

function activityText(activity: string | undefined): string {
  return activity ?? "unlabelled"
}

function sourceKindText(sourceKind: Report["sourceKind"]): string {
  return sourceKind === "human_active" ? "Human collaboration" : "Agent execution"
}

function allocationText(mode: Report["mode"]): string {
  if (mode === "raw") return "full repository time"
  if (mode === "split") return "equal split"

  return "weighted split"
}

function durationText(milliseconds: number): string {
  const totalSeconds = Math.floor(Math.max(0, milliseconds) / 1_000)
  const hours = Math.floor(totalSeconds / 3_600)
  const minutes = Math.floor((totalSeconds % 3_600) / 60)
  const seconds = totalSeconds % 60

  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`
  if (minutes > 0) return `${minutes}m ${seconds}s`

  return `${seconds}s`
}
