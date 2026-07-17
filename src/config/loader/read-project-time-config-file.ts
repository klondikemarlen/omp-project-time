import fs from "node:fs"

import { isEnoent } from "@/utils/is-enoent.js"

export async function readProjectTimeConfigFile(
  filePath: string,
): Promise<unknown | undefined> {
  try {
    const raw = await fs.promises.readFile(filePath, "utf8")

    return JSON.parse(raw)
  } catch (error) {
    if (isEnoent(error)) return undefined

    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Unable to read Project Time config at ${filePath}: ${message}`)
  }
}

export default readProjectTimeConfigFile
