import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

type PackageJson = {
  name?: string
  files?: string[]
  scripts?: {
    build?: string
  }
  omp?: {
    extensions?: string[]
  }
}

test("package ships the OMP entrypoint and canonical spec", async () => {
  const packageJsonUrl = new URL("../package.json", import.meta.url)
  const rawPackageJson = await readFile(packageJsonUrl, "utf8")
  const packageJson = JSON.parse(rawPackageJson) as PackageJson

  assert.equal(packageJson.name, "omp-developer-attention-status")

  assert.deepEqual(packageJson.omp?.extensions, ["./dist/index.js"])
  assert.ok(packageJson.files?.includes("dist"), "expected dist/ in package files")
  assert.ok(packageJson.files?.includes("THIRD_PARTY_NOTICES.txt"), "expected third-party notices in package files")
  assert.match(
    packageJson.scripts?.build ?? "",
    /\brm -rf dist\s+&&\s+tsc --noEmit -p tsconfig\.json\s+&&\s+tsc -p tsconfig\.build\.json\b/,
    "expected build script to emit readable ESM modules at dist/",
  )

  const canonicalSpecUrl = new URL("../spec/developer-attention-status.yml", import.meta.url)
  const canonicalSpec = await readFile(canonicalSpecUrl, "utf8")
  assert.match(canonicalSpec, /^feature: developer-attention-status$/m)
})

test("ships generated modules with separated declarations", async () => {
  const ledgerUrl = new URL("../dist/billing/infrastructure/spread-ledger.js", import.meta.url)
  const ledger = await readFile(ledgerUrl, "utf8")

  assert.match(ledger, /filePath;\n\n  constructor\(/)
  assert.match(ledger, /}\n\n  async recordPrompt\(/)
  assert.match(ledger, /}\n}\n\nfunction isStoredConfig\(/)

  const repositoryIdentityUrl = new URL("../dist/time-log/domain/repository-identity.js", import.meta.url)
  const repositoryIdentity = await readFile(repositoryIdentityUrl, "utf8")

  assert.match(repositoryIdentity, /}\n\nfunction repositoryIdentityFromUrl\(/)

  const refreshIntervalUrl = new URL("../dist/billing/calculation/refresh-interval.js", import.meta.url)
  const refreshInterval = await readFile(refreshIntervalUrl, "utf8")

  assert.match(refreshInterval, /time-constants\.js";\n\nexport function refreshIntervalMs\(/)
})
