export type SourceKind = "human_active" | "agent_turn_elapsed"

export type TimeLogAttribution = {
  projectId: string
  projectName: string
  categoryId: string
  categoryLabel: string
  task?: string
}

export type Repository = {
  project: string
  repositoryId: string
}

export type AutomaticTimeLogInput = {
  sourceKind: SourceKind
  project: string
  repositoryId: string
  sessionId?: string
  sourceKey: string
  startAtMs: number
  endAtMs: number
  attribution?: TimeLogAttribution
}

export type TimeLogEntry = {
  id: string
  sourceKind: SourceKind
  project: string
  repositoryId: string
  sessionId?: string
  startAtMs: number
  endAtMs: number
  createdAtMs: number
  attribution?: TimeLogAttribution
}
