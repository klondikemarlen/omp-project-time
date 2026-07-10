import { createHash, randomUUID } from "node:crypto"
import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises"
import { homedir } from "node:os"
import path from "node:path"
import { lock } from "proper-lockfile"
import { exportTimeEntries } from "../domain/summary.js"
import { parseTimeLogEntry } from "../domain/parse-entry.js"
import type { AutomaticTimeLogInput, TimeLogEntry } from "../domain/model.js"
export type { AutomaticTimeLogInput, TimeLogEntry } from "../domain/model.js"

type TimeLogState = {
  entries: TimeLogEntry[]
}

export class TimeLogLedger {
  private readonly filePath: string
  private readonly summaryPath: string
  private readonly usesDefaultPath: boolean

  constructor(filePath?: string) {
    const defaultPath = path.join(
      homedir(),
      ".omp",
      "developer-attention-status",
      "time-log.json",
    )

    this.filePath = filePath ?? defaultPath
    this.summaryPath = `${this.filePath}.summary.json`
    this.usesDefaultPath = filePath === undefined
  }

  async recordAutomatic(input: AutomaticTimeLogInput): Promise<TimeLogEntry> {
    const entry = createTimeLogEntry(input)

    return this.withLock(async () => {
      const state = await this.readState()
      const existingIndex = state.entries.findIndex((candidate) => candidate.id === entry.id)
      if (existingIndex !== -1) {
        const existingEntry = state.entries[existingIndex]
        if (entry.endAtMs > existingEntry.endAtMs) {
          const extendedEntry = { ...existingEntry, endAtMs: entry.endAtMs }
          state.entries[existingIndex] = extendedEntry
          await this.writeState(state)
          return extendedEntry
        }

        await this.writeSummary(state)
        return existingEntry
      }

      state.entries.push(entry)
      await this.writeState(state)
      return entry
    })
  }

  async entries(): Promise<TimeLogEntry[]> {
    return this.withLock(async () => {
      const state = await this.readState()
      return state.entries
    })
  }

  private async withLock<T>(operation: () => Promise<T>): Promise<T> {
    const parentPath = path.dirname(this.filePath)
    await mkdir(parentPath, { recursive: true, mode: 0o700 })
    if (this.usesDefaultPath) await chmod(parentPath, 0o700)
    const release = await lock(this.filePath, {
      realpath: false,
      stale: 60_000,
      update: 30_000,
      retries: {
        retries: 3,
        factor: 1.5,
        minTimeout: 100,
        maxTimeout: 1_000,
      },
    })
    let operationFailed = false

    try {
      return await operation()
    } catch (error) {
      operationFailed = true
      throw error
    } finally {
      try {
        await release()
      } catch (error) {
        if (!operationFailed) throw error
      }
    }
  }

  private async readState(): Promise<TimeLogState> {
    let content: string

    try {
      content = await readFile(this.filePath, "utf8")
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") {
        return { entries: [] }
      }

      throw error
    }

    let value: unknown
    try {
      value = JSON.parse(content)
    } catch {
      throw new Error("Time log state is unreadable.")
    }

    const state = parseTimeLogState(value)
    if (state === undefined) throw new Error("Time log state is invalid.")
    return state
  }

  private async writeState(state: TimeLogState): Promise<void> {
    const temporaryPath = `${this.filePath}.${process.pid}.${randomUUID()}.tmp`
    const content = JSON.stringify(state)
    await writeFile(temporaryPath, content, { mode: 0o600 })
    await rename(temporaryPath, this.filePath)
    await this.writeSummary(state)
  }

  private async writeSummary(state: TimeLogState): Promise<void> {
    const temporaryPath = `${this.summaryPath}.${process.pid}.${randomUUID()}.tmp`
    const content = exportTimeEntries(state.entries)
    await writeFile(temporaryPath, content, { mode: 0o600 })
    await rename(temporaryPath, this.summaryPath)
  }
}

function createTimeLogEntry(input: AutomaticTimeLogInput): TimeLogEntry {
  const project = input.project.trim()
  const repositoryId = input.repositoryId.trim()
  const sourceKey = input.sourceKey.trim()
  const startAtMs = input.startAtMs
  const endAtMs = input.endAtMs

  if (project.length === 0) throw new Error("Time log project is required.")
  if (repositoryId.length === 0) throw new Error("Time log repository identity is required.")
  if (sourceKey.length === 0) throw new Error("Time log source key is required.")
  if (!Number.isFinite(startAtMs) || !Number.isFinite(endAtMs) || startAtMs >= endAtMs) {
    throw new Error("Time log timestamps must define a positive interval.")
  }

  const id = `auto-${createHash("sha256").update(sourceKey).digest("hex")}`
  const createdAtMs = Date.now()

  return { id, project, repositoryId, startAtMs, endAtMs, createdAtMs }
}

function parseTimeLogState(value: unknown): TimeLogState | undefined {
  if (typeof value !== "object" || value === null || !("entries" in value) || !Array.isArray(value.entries)) {
    return undefined
  }

  const entries: TimeLogEntry[] = []
  for (const valueEntry of value.entries) {
    const entry = parseTimeLogEntry(valueEntry)
    if (entry === undefined) return undefined
    entries.push(entry)
  }

  return { entries }
}
