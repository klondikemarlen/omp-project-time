import { chmodSync, existsSync, readFileSync } from "node:fs";
import { chmod, mkdir, readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import path from "node:path";
import { lock } from "@/vendor/proper-lockfile.js";
import {
  automaticTimeLogEntryId,
  recordAutomaticTimeLogEntry,
} from "@/time-log/domain/record-automatic-entry.js";
import { parseTimeLogEntry } from "@/time-log/domain/parse-entry.js";
import { parseTimeLogState } from "@/time-log/infrastructure/state-mapper.js";
import type {
  AutomaticTimeLogInput,
  TimeLogEntry,
} from "@/time-log/domain/model.js";
export type {
  AutomaticTimeLogInput,
  TimeLogEntry,
} from "@/time-log/domain/model.js";

const SCHEMA_VERSION = "1";
const LEGACY_JSON_MIGRATION = "legacy_json_migration";

type SqliteRow = Record<string, unknown>;

type SqliteStatement = {
  all(...parameters: unknown[]): SqliteRow[];
  get(...parameters: unknown[]): SqliteRow | null | undefined;
  run(...parameters: unknown[]): unknown;
};

type SqliteDatabase = {
  close(): void;
  exec(sql: string): void;
  prepare?(sql: string): SqliteStatement;
  query?(sql: string): SqliteStatement;
};

type SqliteDatabaseConstructor = new (filePath: string) => SqliteDatabase;

function openSqliteDatabase(filePath: string): SqliteDatabase {
  const require = createRequire(import.meta.url);
  const sqliteModule =
    "Bun" in globalThis
      ? (require("bun:sqlite") as {
          Database: SqliteDatabaseConstructor;
        })
      : (require("node:sqlite") as {
          DatabaseSync: SqliteDatabaseConstructor;
        });

  return "DatabaseSync" in sqliteModule
    ? new sqliteModule.DatabaseSync(filePath)
    : new sqliteModule.Database(filePath);
}

function statement(database: SqliteDatabase, sql: string): SqliteStatement {
  if (database.query !== undefined) return database.query(sql);
  if (database.prepare !== undefined) return database.prepare(sql);
  throw new Error("SQLite database does not support prepared statements.");
}

function isMissingFile(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    error.code === "ENOENT"
  );
}

export class TimeLogLedger {
  private readonly databasePath: string;
  private readonly legacyJsonPath: string | undefined;
  private readonly usesDefaultPath: boolean;

  constructor(databasePath?: string, legacyJsonPath?: string) {
    const dataDirectory = path.join(homedir(), ".omp", "project-time");
    const databasePathWasLegacyJson =
      databasePath?.endsWith(".json") === true &&
      legacyJsonPath === undefined;

    this.databasePath =
      databasePath === undefined
        ? path.join(dataDirectory, "time-log.sqlite")
        : databasePathWasLegacyJson
          ? `${databasePath.slice(0, -".json".length)}.sqlite`
          : databasePath;
    this.legacyJsonPath =
      legacyJsonPath ??
      (databasePathWasLegacyJson
        ? databasePath
        : databasePath === undefined
          ? path.join(dataDirectory, "time-log.json")
          : undefined);
    this.usesDefaultPath = databasePath === undefined;
  }

  async recordAutomatic(input: AutomaticTimeLogInput): Promise<TimeLogEntry> {
    return this.withLock(() =>
      this.withDatabase((database) => {
        const existing = statement(
          database,
          "SELECT entry_json FROM entries WHERE id = ?",
        ).get(automaticTimeLogEntryId(input.sourceKey));
        const recorded = recordAutomaticTimeLogEntry(
          existing === undefined || existing === null
            ? []
            : [this.parseDatabaseEntry(existing.entry_json)],
          input,
        );

        if (recorded.changed) this.writeEntry(database, recorded.entry);
        return recorded.entry;
      }),
    );
  }

  async entries(): Promise<TimeLogEntry[]> {
    return this.withLock(() =>
      this.withDatabase((database) =>
        statement(
          database,
          "SELECT entry_json FROM entries ORDER BY rowid",
        )
          .all()
          .map((row) => this.parseDatabaseEntry(row.entry_json)),
      ),
    );
  }

  projectNames(): string[] {
    try {
      if (!existsSync(this.databasePath) && this.legacyJsonPath !== undefined) {
        const entries = this.readLegacyEntriesSync();
        return [...new Set(entries.map((entry) => entry.project))].sort();
      }

      const database = this.openDatabase();
      try {
        this.initializeDatabase(database);
        return statement(database, "SELECT DISTINCT project FROM entries")
          .all()
          .map((row) => row.project)
          .filter((project): project is string => typeof project === "string")
          .sort();
      } finally {
        database.close();
      }
    } catch {
      return [];
    }
  }

  private async withLock<T>(operation: () => Promise<T>): Promise<T> {
    const parentPath = path.dirname(this.databasePath);
    await mkdir(parentPath, { recursive: true, mode: 0o700 });
    if (this.usesDefaultPath) await chmod(parentPath, 0o700);
    const releaseDatabase = await this.acquireLock(this.databasePath);
    let releaseLegacyJson: (() => Promise<void>) | undefined;
    let operationFailed = false;

    try {
      if (
        this.legacyJsonPath !== undefined &&
        existsSync(this.legacyJsonPath)
      ) {
        releaseLegacyJson = await this.acquireLock(this.legacyJsonPath);
      }
      return await operation();
    } catch (error) {
      operationFailed = true;
      throw error;
    } finally {
      let releaseError: unknown;

      try {
        await releaseLegacyJson?.();
      } catch (error) {
        releaseError = error;
      }
      try {
        await releaseDatabase();
      } catch (error) {
        releaseError ??= error;
      }
      if (!operationFailed && releaseError !== undefined) throw releaseError;
    }
  }

  private acquireLock(filePath: string) {
    return lock(filePath, {
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
  }

  private async withDatabase<T>(
    operation: (database: SqliteDatabase) => T | Promise<T>,
  ): Promise<T> {
    const database = this.openDatabase();

    try {
      this.initializeDatabase(database);
      await this.migrateLegacyJson(database);
      return await operation(database);
    } finally {
      database.close();
    }
  }

  private openDatabase(): SqliteDatabase {
    const database = openSqliteDatabase(this.databasePath);
    chmodSync(this.databasePath, 0o600);
    return database;
  }

  private initializeDatabase(database: SqliteDatabase): void {
    database.exec(`
      CREATE TABLE IF NOT EXISTS metadata (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS entries (
        id TEXT PRIMARY KEY,
        project TEXT NOT NULL,
        entry_json TEXT NOT NULL
      );
    `);
    statement(
      database,
      "INSERT OR IGNORE INTO metadata (key, value) VALUES (?, ?)",
    ).run("schema_version", SCHEMA_VERSION);
  }

  private async migrateLegacyJson(database: SqliteDatabase): Promise<void> {
    if (
      this.legacyJsonPath === undefined ||
      this.metadataValue(database, LEGACY_JSON_MIGRATION) !== undefined
    ) {
      return;
    }

    let content: string;
    try {
      content = await readFile(this.legacyJsonPath, "utf8");
    } catch (error) {
      if (isMissingFile(error)) return;
      throw error;
    }

    const entries = this.parseLegacyEntries(content);
    this.transaction(database, () => {
      const existing = statement(
        database,
        "SELECT COUNT(*) AS count FROM entries",
      ).get();
      if (existing?.count !== 0) {
        throw new Error(
          "Time log database is already initialized and cannot import legacy state.",
        );
      }

      for (const entry of entries) this.writeEntry(database, entry);
      statement(
        database,
        "INSERT INTO metadata (key, value) VALUES (?, ?)",
      ).run(LEGACY_JSON_MIGRATION, "1");
    });
  }

  private transaction(database: SqliteDatabase, operation: () => void): void {
    database.exec("BEGIN IMMEDIATE");
    try {
      operation();
      database.exec("COMMIT");
    } catch (error) {
      try {
        database.exec("ROLLBACK");
      } catch {
        // The transaction may already be rolled back by SQLite.
      }
      throw error;
    }
  }

  private metadataValue(
    database: SqliteDatabase,
    key: string,
  ): string | undefined {
    const row = statement(
      database,
      "SELECT value FROM metadata WHERE key = ?",
    ).get(key);
    return typeof row?.value === "string" ? row.value : undefined;
  }

  private writeEntry(database: SqliteDatabase, entry: TimeLogEntry): void {
    statement(
      database,
      `
        INSERT INTO entries (id, project, entry_json)
        VALUES (?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          project = excluded.project,
          entry_json = excluded.entry_json
      `,
    ).run(entry.id, entry.project, JSON.stringify(entry));
  }

  private parseDatabaseEntry(value: unknown): TimeLogEntry {
    if (typeof value !== "string") {
      throw new Error("Time log database entry is unreadable.");
    }

    try {
      const entry = parseTimeLogEntry(JSON.parse(value));
      if (entry !== undefined) return entry;
    } catch {
      // Normalize parsing failures to the public persistence error.
    }
    throw new Error("Time log database entry is invalid.");
  }

  private readLegacyEntriesSync(): TimeLogEntry[] {
    if (this.legacyJsonPath === undefined) return [];
    return this.parseLegacyEntries(readFileSync(this.legacyJsonPath, "utf8"));
  }

  private parseLegacyEntries(content: string): TimeLogEntry[] {
    let value: unknown;
    try {
      value = JSON.parse(content);
    } catch {
      throw new Error("Time log state is unreadable.");
    }

    const state = parseTimeLogState(value);
    if (state === undefined) throw new Error("Time log state is invalid.");

    const ids = new Set<string>();
    for (const entry of state.entries) {
      if (ids.has(entry.id)) {
        throw new Error("Time log state contains duplicate entry IDs.");
      }
      ids.add(entry.id);
    }
    return state.entries;
  }

}
