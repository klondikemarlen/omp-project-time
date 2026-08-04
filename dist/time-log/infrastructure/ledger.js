import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { lock } from "../../vendor/proper-lockfile.js";
import { recordAutomaticTimeLogEntry } from "../../time-log/domain/record-automatic-entry.js";
import { parseTimeLogState } from "../../time-log/infrastructure/state-mapper.js";
import { parseManualTimer } from "../../time-log/domain/manual-timer.js";

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

  async startManual(input) {
    const timer = parseManualTimer({ ...input, id: randomUUID() });
    if (timer === undefined) throw new Error("Manual timer is invalid.");
    return this.withLock(async () => {
      const state = await this.readState();
      if (state.activeManualTimer !== undefined) {
        throw new Error("A manual timer is already active.");
      }
      state.activeManualTimer = timer;
      await this.writeState(state);
      return timer;
    });
  }

  async stopManual(nowMs) {
    return this.withLock(async () => {
      const state = await this.readState();
      const timer = state.activeManualTimer;
      if (timer === undefined) throw new Error("No manual timer is active.");
      const recorded = recordAutomaticTimeLogEntry(state.entries, {
        sourceKind: "manual_tracked",
        project: timer.project,
        repositoryId: timer.repositoryId,
        ...(timer.repositoryIdentity === undefined
          ? {}
          : { repositoryIdentity: timer.repositoryIdentity }),
        ...(timer.activity === undefined ? {} : { activity: timer.activity }),
        sourceKey: `manual:${timer.id}`,
        startAtMs: timer.startAtMs,
        endAtMs: nowMs,
        timeZone: timer.timeZone,
      });
      delete state.activeManualTimer;
      await this.writeState(state);
      return recorded.entry;
    });
  }

  async entries() {
    return this.withLock(async () => {
      const state = await this.readState();
      return state.entries;
    });
  }

  projectNames() {
    try {
      const value = JSON.parse(readFileSync(this.filePath, "utf8"));
      const state = parseTimeLogState(value);
      if (state === undefined) return [];
      return [...new Set(state.entries.map((entry) => entry.project))].sort();
    } catch {
      return [];
    }
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
