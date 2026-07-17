import { randomUUID } from "node:crypto";
import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { lock } from "../../vendor/proper-lockfile.js";
import { recordAutomaticTimeLogEntry } from "../../time-log/domain/record-automatic-entry.js";
import { parseTimeLogState } from "../../time-log/infrastructure/state-mapper.js";

export class TimeLogLedger {
  filePath;

  usesDefaultPath;

  constructor(filePath) {
    const defaultPath = path.join(
      homedir(),
      ".omp",
      "project-time",
      "time-log.json",
    );
    this.filePath = filePath ?? defaultPath;
    this.usesDefaultPath = filePath === undefined;
  }

  async recordAutomatic(input) {
    return this.withLock(async () => {
      const state = await this.readState();
      const recorded = recordAutomaticTimeLogEntry(state.entries, input);
      if (recorded.changed) await this.writeState(state);
      return recorded.entry;
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
  }
}
