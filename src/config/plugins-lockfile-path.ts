import { homedir } from "node:os"
import path from "node:path"

export function pluginsLockfilePath(): string {
  return path.join(homedir(), ".omp", "plugins", "omp-plugins.lock.json")
}
