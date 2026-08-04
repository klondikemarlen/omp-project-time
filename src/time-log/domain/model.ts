import type { ActivityNarrative } from "@/time-log/domain/narrative.js"
import type { WorkItem } from "@/time-log/domain/work-item.js"

export type SourceKind =
  | "human_active"
  | "agent_turn_elapsed"
  | "manual_tracked"



export type Repository = {
  project: string
  repositoryId: string
  repositoryIdentity?: string
}

export type AutomaticTimeLogInput = {
  sourceKind: SourceKind
  project: string
  repositoryId: string
  repositoryIdentity?: string
  sessionId?: string
  activity?: string
  narrative?: ActivityNarrative
  workItem?: WorkItem
  timeZone?: string
  sourceKey: string
  startAtMs: number
  endAtMs: number
}

export type TimeLogEntry = {
  id: string
  sourceKind: SourceKind
  project: string
  repositoryId: string
  repositoryIdentity?: string
  sessionId?: string
  activity?: string
  narrative?: ActivityNarrative
  workItem?: WorkItem
  timeZone?: string
  startAtMs: number
  endAtMs: number
  createdAtMs: number
}

export type ManualTimerInput = {
  project: string
  repositoryId: string
  repositoryIdentity?: string
  activity?: string
  startAtMs: number
  timeZone: string
}

export type ManualTimer = ManualTimerInput & {
  id: string
}
