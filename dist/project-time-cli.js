#!/usr/bin/env node
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  defaultProjectTimeDataRoot,
  prepareProjectTimeDataRoot,
} from "./extension/local-data-root.js";
import {
  formatTimeLogEvidence,
  formatTimeLogPruneResult,
  formatTimeLogStatistics,
} from "./time-log/infrastructure/state-mapper.js";
import { AutomaticTimeLogRecorder } from "./time-log/recorder.js";

function parseProjectTimeCliCommand(args) {
  const [command, ...options] = args;
  if (command === "entries" || command === "stats") {
    if (options.length === 0) return { kind: command, project: undefined };
    if (
      options.length === 2 &&
      options[0] === "--project" &&
      options[1]?.trim() !== ""
    ) {
      return { kind: command, project: options[1] };
    }
  }
  if (command === "prune") return parsePruneCommand(options);
  throw new Error(
    "Usage: project-time entries [--project NAME]\n" +
      "       project-time stats [--project NAME]\n" +
      "       project-time prune --before YYYY-MM-DD [--dry-run]",
  );
}

function parsePruneCommand(options) {
  let before;
  let dryRun = false;
  for (let index = 0; index < options.length; index += 1) {
    const option = options[index];
    if (option === "--dry-run" && !dryRun) {
      dryRun = true;
      continue;
    }
    if (option === "--before" && before === undefined) {
      const date = options[index + 1];
      if (date === undefined) break;
      before = date;
      index += 1;
      continue;
    }
    throw new Error(
      "Usage: project-time prune --before YYYY-MM-DD [--dry-run]",
    );
  }
  if (before === undefined) {
    throw new Error(
      "Usage: project-time prune --before YYYY-MM-DD [--dry-run]",
    );
  }
  const cutoffAtMs = localDateStartAtMs(before);
  return { kind: "prune", before, cutoffAtMs, dryRun };
}

function localDateStartAtMs(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (match === null) {
    throw new Error("Prune date must use local YYYY-MM-DD format.");
  }
  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    throw new Error("Prune date must be a valid local YYYY-MM-DD date.");
  }
  return date.getTime();
}

export async function runProjectTimeCli(args) {
  const command = parseProjectTimeCliCommand(args);
  const dataRoot = defaultProjectTimeDataRoot();
  await prepareProjectTimeDataRoot(dataRoot);
  const recorder = new AutomaticTimeLogRecorder();
  if (command.kind === "entries") {
    const entries = await recorder.entries();
    process.stdout.write(
      `${formatTimeLogEvidence(entries, command.project)}\n`,
    );
    return;
  }
  if (command.kind === "stats") {
    const entries = await recorder.entries();
    const localStorageBytes = await recorder.storageBytes();
    process.stdout.write(
      `${formatTimeLogStatistics(entries, command.project, localStorageBytes)}\n`,
    );
    return;
  }
  const result = await recorder.pruneEntriesEndingAtOrBefore(
    command.cutoffAtMs,
    command.dryRun,
  );
  process.stdout.write(
    `${formatTimeLogPruneResult({
      before: command.before,
      dryRun: command.dryRun,
      ...result,
    })}\n`,
  );
}

if (
  process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === realpathSync(process.argv[1])
) {
  runProjectTimeCli(process.argv.slice(2)).catch((error) => {
    process.stderr.write(
      `Project Time command error: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  });
}
