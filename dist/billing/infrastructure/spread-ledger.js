import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { lock } from "proper-lockfile";
import { parseDeveloperCostState } from "../state/parser.js";
import { recordDeveloperPrompt } from "../operations/record-prompt.js";
import { settleSpreadDeveloperCostStates } from "../operations/settle-shared-state.js";

export class SpreadBillingLedger {
  filePath;

  constructor(filePath) {
    this.filePath =
      filePath ??
      path.join(
        homedir(),
        ".omp",
        "developer-cost-status",
        "spread-billing.json",
      );
  }

  async recordPrompt(sessionId, state, promptAtMs, config) {
    return this.update(sessionId, state, promptAtMs, config, "prompt");
  }

  async settle(sessionId, state, nowMs, config) {
    return this.update(sessionId, state, nowMs, config, "settle");
  }

  async update(sessionId, state, nowMs, config, updateKind) {
    return this.withLock(async () => {
      const ledger = await this.readLedger();
      const settlementAtMs = Math.max(nowMs, ledger.settledThroughMs);
      const existingSession = ledger.sessions.get(sessionId);
      const currentState = existingSession?.state ?? { ...state };
      if (
        existingSession === undefined &&
        currentState.activeStartAtMs !== undefined &&
        currentState.activeUntilMs !== undefined
      ) {
        const settledFromMs =
          currentState.lastSettledAtMs ?? currentState.activeStartAtMs;
        currentState.lastSettledAtMs = Math.max(
          settledFromMs,
          ledger.settledThroughMs,
        );
      }
      ledger.sessions.set(sessionId, {
        state: currentState,
        config,
      });
      const settledSessions = settleSpreadDeveloperCostStates(
        [...ledger.sessions].map(([id, entry]) => ({
          sessionId: id,
          state: entry.state,
          config: entry.config,
        })),
        settlementAtMs,
      );
      ledger.sessions.clear();
      for (const settledSession of settledSessions) {
        ledger.sessions.set(settledSession.sessionId, {
          state: settledSession.state,
          config: settledSession.config,
        });
      }
      ledger.settledThroughMs = settlementAtMs;
      const settledSession = ledger.sessions.get(sessionId);
      if (settledSession === undefined) {
        throw new Error(
          `Developer cost status cannot settle session ${sessionId}.`,
        );
      }
      let nextState = settledSession.state;
      if (updateKind === "prompt") {
        nextState = recordDeveloperPrompt(
          settledSession.state,
          settlementAtMs,
          config,
        );
        nextState.lastPromptAtMs = Math.max(
          nowMs,
          settledSession.state.lastPromptAtMs ?? nowMs,
        );
      }
      ledger.sessions.set(sessionId, { state: nextState, config });
      // ponytail: ledger grows with historical sessions; add persisted acknowledgements before pruning.
      await this.writeLedger(ledger);
      return nextState;
    });
  }

  async withLock(operation) {
    const parentPath = path.dirname(this.filePath);
    await mkdir(parentPath, { recursive: true });
    const release = await lock(this.filePath, {
      realpath: false,
      stale: 60_000,
      update: 30_000,
      retries: {
        forever: true,
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

  async readLedger() {
    let content;
    try {
      content = await readFile(this.filePath, "utf8");
    } catch (error) {
      if (
        error instanceof Error &&
        "code" in error &&
        error.code === "ENOENT"
      ) {
        return {
          sessions: new Map(),
          settledThroughMs: 0,
        };
      }
      throw error;
    }
    let value;
    try {
      value = JSON.parse(content);
    } catch {
      throw new Error(
        "Developer cost status spread billing state is unreadable.",
      );
    }
    if (
      typeof value !== "object" ||
      value === null ||
      !("sessions" in value) ||
      typeof value.sessions !== "object" ||
      value.sessions === null ||
      Array.isArray(value.sessions)
    ) {
      throw new Error("Developer cost status spread billing state is invalid.");
    }
    const rawSettledThroughMs =
      "settledThroughMs" in value ? value.settledThroughMs : 0;
    if (
      typeof rawSettledThroughMs !== "number" ||
      !Number.isFinite(rawSettledThroughMs)
    ) {
      throw new Error("Developer cost status spread billing state is invalid.");
    }
    const sessions = new Map();
    for (const [sessionId, entry] of Object.entries(value.sessions)) {
      if (
        typeof entry !== "object" ||
        entry === null ||
        !("state" in entry) ||
        !("config" in entry) ||
        !isStoredConfig(entry.config)
      ) {
        throw new Error(
          "Developer cost status spread billing state is invalid.",
        );
      }
      const state = parseDeveloperCostState(entry.state);
      if (state === undefined) {
        throw new Error(
          "Developer cost status spread billing state is invalid.",
        );
      }
      sessions.set(sessionId, {
        state,
        config: entry.config,
      });
    }
    return {
      sessions,
      settledThroughMs: rawSettledThroughMs,
    };
  }

  async writeLedger(ledger) {
    const temporaryPath = `${this.filePath}.${process.pid}.${Date.now()}.tmp`;
    const sessions = Object.fromEntries(ledger.sessions);
    const content = JSON.stringify({
      settledThroughMs: ledger.settledThroughMs,
      sessions,
    });
    await writeFile(temporaryPath, content);
    await rename(temporaryPath, this.filePath);
  }
}

function isStoredConfig(value) {
  if (typeof value !== "object" || value === null) return false;
  if (
    !("monthlySalary" in value) ||
    !("hoursPerWeek" in value) ||
    !("weeksPerYear" in value) ||
    !("activeWindowMinutes" in value) ||
    !("refreshIntervalSeconds" in value) ||
    !("label" in value)
  ) {
    return false;
  }
  const monthlySalary = value.monthlySalary;
  const hoursPerWeek = value.hoursPerWeek;
  const weeksPerYear = value.weeksPerYear;
  const activeWindowMinutes = value.activeWindowMinutes;
  const refreshIntervalSeconds = value.refreshIntervalSeconds;
  const label = value.label;
  return (
    typeof monthlySalary === "number" &&
    Number.isFinite(monthlySalary) &&
    monthlySalary > 0 &&
    typeof hoursPerWeek === "number" &&
    Number.isFinite(hoursPerWeek) &&
    hoursPerWeek > 0 &&
    typeof weeksPerYear === "number" &&
    Number.isFinite(weeksPerYear) &&
    weeksPerYear > 0 &&
    typeof activeWindowMinutes === "number" &&
    Number.isFinite(activeWindowMinutes) &&
    activeWindowMinutes > 0 &&
    typeof refreshIntervalSeconds === "number" &&
    Number.isFinite(refreshIntervalSeconds) &&
    refreshIntervalSeconds > 0 &&
    typeof label === "string" &&
    label.length > 0
  );
}
