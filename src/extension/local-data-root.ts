import { chmod, lstat, mkdir, rm, writeFile } from "node:fs/promises"
import { homedir } from "node:os"
import path from "node:path"

const ompDataRoot = path.join(homedir(), ".omp")
const legacyDataRoot = path.join(ompDataRoot, "developer-attention-status")
const projectTimeDataRoot = path.join(ompDataRoot, "project-time")
const trackingDataMarker = ".project-time-v4"

export function defaultProjectTimeDataRoot(): string {
  return projectTimeDataRoot
}

export async function prepareProjectTimeDataRoot(
  rootPath = projectTimeDataRoot,
  oldRoot = legacyDataRoot,
  oldSpreadLedgerDirectory = path.join(ompDataRoot, "developer-cost-status"),
): Promise<void> {
  const markerPath = path.join(rootPath, trackingDataMarker)
  if (!await exists(markerPath)) {
    await Promise.all([
      rm(rootPath, { recursive: true, force: true }),
      rm(oldRoot, { recursive: true, force: true }),
      rm(oldSpreadLedgerDirectory, { recursive: true, force: true }),
    ])
    await mkdir(rootPath, { recursive: true, mode: 0o700 })
    await writeFile(markerPath, "project-time-v4\n", { mode: 0o600 })
  }

  await chmod(rootPath, 0o700)
}


async function exists(filePath: string): Promise<boolean> {
  try {
    await lstat(filePath)
    return true
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false
    throw error
  }
}
