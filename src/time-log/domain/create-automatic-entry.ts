import { gitContextKey, type GitContext } from "@/time-log/domain/git-context.js"
import { workItemKey } from "@/time-log/domain/work-item.js"
import type { ProjectTimeState } from "@/time-log/domain/state.js"
import type { ActivityNarrative } from "@/time-log/domain/narrative.js"
import type {
  WorkItem,
  WorkItemAttribution,
} from "@/time-log/domain/work-item.js"
import type { AutomaticTimeLogInput, Repository } from "@/time-log/domain/model.js"

type AutomaticEntryOptions = {
  nowMs: number
  repository: Repository
  sessionId: string
  sourceStartedAtMs: number
  activity?: string
  narrative?: ActivityNarrative
  workItem?: WorkItem
  gitContext?: GitContext
  workItemAttribution?: WorkItemAttribution
  activityStartedAtMs?: number
  stateBeforeSettlement: ProjectTimeState
  settledState: ProjectTimeState
}

export function createAutomaticTimeLogEntry(
  options: AutomaticEntryOptions,
): AutomaticTimeLogInput | undefined {
  const stateBeforeSettlement = options.stateBeforeSettlement
  if (
    stateBeforeSettlement.activeStartAtMs === undefined
    || stateBeforeSettlement.activeUntilMs === undefined
  ) {
    return undefined
  }

  const settledMilliseconds =
    options.settledState.activeMilliseconds
    - stateBeforeSettlement.activeMilliseconds
  if (settledMilliseconds <= 0) return undefined

  const settledUntilMs = Math.min(options.nowMs, stateBeforeSettlement.activeUntilMs)
  const workItemAttribution =
    options.workItemAttribution
    ?? (options.workItem === undefined ? "unassigned" : "legacy_unknown")
  const startAtMs = Math.max(
    stateBeforeSettlement.activeStartAtMs,
    settledUntilMs - settledMilliseconds,
  )
  const activityStartedAtMs = options.activityStartedAtMs
  const entryStartAtMs = Math.max(
    startAtMs,
    activityStartedAtMs ?? startAtMs,
  )
  if (entryStartAtMs >= settledUntilMs) return undefined

  return {
    sourceKind: "human_active",
    project: options.repository.project,
    repositoryId: options.repository.repositoryId,
    ...(options.repository.repositoryIdentity === undefined
      ? {}
      : { repositoryIdentity: options.repository.repositoryIdentity }),
    sessionId: options.sessionId,
    ...(options.activity === undefined ? {} : { activity: options.activity }),
    ...(options.narrative === undefined ? {} : { narrative: options.narrative }),
    ...(options.workItem === undefined ? {} : { workItem: options.workItem }),
    ...(options.gitContext === undefined ? {} : { gitContext: options.gitContext }),
    workItemAttribution,
    sourceKey: `${options.sessionId}:${options.repository.repositoryId}:${options.sourceStartedAtMs}:${activityStartedAtMs ?? options.sourceStartedAtMs}:${workItemAttribution}:${options.workItem?.kind ?? ""}:${options.workItem?.kind === "jira" ? options.workItem.key : options.workItem?.number ?? ""}:${options.workItem?.kind === "jira" ? "" : options.workItem?.repository ?? ""}${options.gitContext === undefined ? "" : `:${workItemKey(options.workItem)}:${gitContextKey(options.gitContext)}`}`,
    startAtMs: entryStartAtMs,
    endAtMs: settledUntilMs,
  }
}

export default createAutomaticTimeLogEntry
