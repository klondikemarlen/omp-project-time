import { createHash, randomUUID } from "node:crypto";
import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { lock } from "../../vendor/proper-lockfile.js";
import { exportTimeEntries } from "../../time-log/domain/summary.js";
import { parseTimeLogEntry } from "../../time-log/domain/parse-entry.js";

export class TimeLogLedger {
  filePath;

  summaryPath;

  usesDefaultPath;

  constructor(filePath) {
    const defaultPath = path.join(
      homedir(),
      ".omp",
      "developer-attention-status",
      "time-log.json",
    );
    this.filePath = filePath ?? defaultPath;
    this.summaryPath = `${this.filePath}.summary.json`;
    this.usesDefaultPath = filePath === undefined;
  }

  async recordAutomatic(input) {
    const entry = createTimeLogEntry(input);
    return this.withLock(async () => {
      const state = await this.readState();
      const existingIndex = state.entries.findIndex(
        (candidate) => candidate.id === entry.id,
      );
      if (existingIndex !== -1) {
        const existingEntry = state.entries[existingIndex];
        if (entry.endAtMs > existingEntry.endAtMs) {
          const extendedEntry = { ...existingEntry, endAtMs: entry.endAtMs };
          state.entries[existingIndex] = extendedEntry;
          await this.writeState(state);
          return extendedEntry;
        }
        await this.writeSummary(state);
        return existingEntry;
      }
      state.entries.push(entry);
      await this.writeState(state);
      return entry;
    });
  }

  async entries() {
    return this.withLock(async () => {
      const state = await this.readState();
      return state.entries;
    });
  }

  async withLock(operation) {
    const parentPath = path.dirname(this.filePath);
    await mkdir(parentPath, { recursive: true, mode: 0o700 });
    if (this.usesDefaultPath) await chmod(parentPath, 0o700);
    const release = await lock(this.filePath, {
      realpath: false,
      stale: 5_000,
      update: 2_500,
      retries: {
        retries: 10,
        factor: 1.5,
        minTimeout: 100,
        maxTimeout: 1_000,
      },
    });
    let operationFailed = false;
    try {
      return await operation();
    } catch (error) {
      operationFailed = true;
      throw error;
    } finally {
      try {
        await release();
      } catch (error) {
        if (!operationFailed) throw error;
      }
    }
  }

  async readState() {
    let content;
    try {
      content = await readFile(this.filePath, "utf8");
    } catch (error) {
      if (
        error instanceof Error &&
        "code" in error &&
        error.code === "ENOENT"
      ) {
        return { entries: [] };
      }
      throw error;
    }
    let value;
    try {
      value = JSON.parse(content);
    } catch {
      throw new Error("Time log state is unreadable.");
    }
    const state = parseTimeLogState(value);
    if (state === undefined) throw new Error("Time log state is invalid.");
    return state;
  }

  async writeState(state) {
    const temporaryPath = `${this.filePath}.${process.pid}.${randomUUID()}.tmp`;
    const content = JSON.stringify(state);
    await writeFile(temporaryPath, content, { mode: 0o600 });
    await rename(temporaryPath, this.filePath);
    await this.writeSummary(state);
  }

  async writeSummary(state) {
    const temporaryPath = `${this.summaryPath}.${process.pid}.${randomUUID()}.tmp`;
    const content = exportTimeEntries(state.entries);
    await writeFile(temporaryPath, content, { mode: 0o600 });
    await rename(temporaryPath, this.summaryPath);
  }
}

function createTimeLogEntry(input) {
  const project = input.project.trim();
  const repositoryId = input.repositoryId.trim();
  const sourceKey = input.sourceKey.trim();
  const startAtMs = input.startAtMs;
  const endAtMs = input.endAtMs;
  if (project.length === 0) throw new Error("Time log project is required.");
  if (repositoryId.length === 0)
    throw new Error("Time log repository identity is required.");
  if (sourceKey.length === 0)
    throw new Error("Time log source key is required.");
  if (
    !Number.isFinite(startAtMs) ||
    !Number.isFinite(endAtMs) ||
    startAtMs >= endAtMs
  ) {
    throw new Error("Time log timestamps must define a positive interval.");
  }
  const id = `auto-${createHash("sha256").update(sourceKey).digest("hex")}`;
  const createdAtMs = Date.now();
  return { id, project, repositoryId, startAtMs, endAtMs, createdAtMs };
}

function parseTimeLogState(value) {
  if (
    typeof value !== "object" ||
    value === null ||
    !("entries" in value) ||
    !Array.isArray(value.entries)
  ) {
    return undefined;
  }
  const entries = [];
  for (const valueEntry of value.entries) {
    const entry = parseTimeLogEntry(valueEntry);
    if (entry === undefined) return undefined;
    entries.push(entry);
  }
  return { entries };
}
