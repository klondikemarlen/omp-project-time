import { chmod, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

const projectTimeDataRoot = path.join(homedir(), ".omp", "project-time");
export function defaultProjectTimeDataRoot() {
  return projectTimeDataRoot;
}

export async function prepareProjectTimeDataRoot(
  rootPath = projectTimeDataRoot,
) {
  await mkdir(rootPath, { recursive: true, mode: 0o700 });
  await chmod(rootPath, 0o700);
}
