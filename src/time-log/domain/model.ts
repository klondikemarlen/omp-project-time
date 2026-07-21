import type { ActivityNarrative } from "@/time-log/domain/narrative.js"

export type SourceKind = "human_active" | "agent_turn_elapsed"



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
  startAtMs: number
  endAtMs: number
  createdAtMs: number
}
