export type TimesheetAttribution = {
  projectId: string
  projectName: string
  categoryId: string
  categoryLabel: string
}

export type AutomaticTimeLogInput = {
  endAtMs: number
  project: string
  repositoryId: string
  sessionId?: string
  sourceKey: string
  startAtMs: number
  timesheet?: TimesheetAttribution
}

export type TimeLogEntry = Omit<AutomaticTimeLogInput, "sourceKey" | "sessionId" | "timesheet"> & {
  createdAtMs: number
  id: string
  sessionId?: string
  timesheet?: TimesheetAttribution
}
