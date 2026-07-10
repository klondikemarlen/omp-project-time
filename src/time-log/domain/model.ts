export type AutomaticTimeLogInput = {
  endAtMs: number
  project: string
  repositoryId: string
  sourceKey: string
  startAtMs: number
}

export type TimeLogEntry = Omit<AutomaticTimeLogInput, "sourceKey"> & {
  createdAtMs: number
  id: string
}
