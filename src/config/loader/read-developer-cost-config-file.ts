import fs from "node:fs"

import { isEnoent } from "@/utils/is-enoent.js"

export async function readDeveloperCostConfigFile<T>(filePath: string): Promise<T | undefined> {
  try {
    const raw = await fs.promises.readFile(filePath, "utf8")

    return JSON.parse(raw) as T
  } catch (error) {
    if (isEnoent(error)) return undefined

    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Unable to read developer cost config at ${filePath}: ${message}`)
  }
}

export default readDeveloperCostConfigFile
