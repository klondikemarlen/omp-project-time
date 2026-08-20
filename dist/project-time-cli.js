#!/usr/bin/env node
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  defaultProjectTimeDataRoot,
  prepareProjectTimeDataRoot,
} from "./extension/local-data-root.js";
import { formatTimeLogEvidence } from "./time-log/infrastructure/state-mapper.js";
import { AutomaticTimeLogRecorder } from "./time-log/recorder.js";

function projectArgument(args) {
  if (args.length === 1 && args[0] === "entries") return undefined;
  if (args.length === 3 && args[0] === "entries" && args[1] === "--project") {
    if (args[2].trim() !== "") return args[2];
  }
  throw new Error("Usage: project-time entries [--project NAME]");
}

export async function runProjectTimeCli(args) {
  const project = projectArgument(args);
  const dataRoot = defaultProjectTimeDataRoot();
  await prepareProjectTimeDataRoot(dataRoot);
  const entries = await new AutomaticTimeLogRecorder().entries();
  process.stdout.write(`${formatTimeLogEvidence(entries, project)}\n`);
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
