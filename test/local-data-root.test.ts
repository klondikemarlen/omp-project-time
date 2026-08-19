import assert from "node:assert/strict";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { prepareProjectTimeDataRoot } from "../src/extension/local-data-root.js";

test("creates a private data root without removing local evidence", async () => {
  const root = path.join(tmpdir(), `project-time-root-${Date.now()}`);
  const recordPath = path.join(root, "time-log.json");

  try {
    await mkdir(root, { recursive: true, mode: 0o700 });
    await writeFile(recordPath, "local evidence\n", { mode: 0o600 });

    await prepareProjectTimeDataRoot(root);

    assert.equal(await readFile(recordPath, "utf8"), "local evidence\n");
    assert.equal((await stat(root)).mode & 0o777, 0o700);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
