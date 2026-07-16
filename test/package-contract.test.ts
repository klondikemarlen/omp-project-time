import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

type PackageJson = {
  name?: string
  files?: string[]
  dependencies?: Record<string, string>
  scripts?: Record<string, string>
  omp?: {
    extensions?: string[]
  }
}

test("package ships the OMP entrypoint and canonical spec", async () => {
  const packageJsonUrl = new URL("../package.json", import.meta.url)
  const rawPackageJson = await readFile(packageJsonUrl, "utf8")
  const packageJson = JSON.parse(rawPackageJson) as PackageJson

  assert.equal(packageJson.name, "omp-project-time")

  assert.deepEqual(packageJson.omp?.extensions, ["./dist/index.js"])
  assert.ok(packageJson.files?.includes("dist"), "expected dist/ in package files")
  assert.ok(packageJson.files?.includes("THIRD_PARTY_NOTICES.txt"), "expected third-party notices in package files")
  assert.equal(packageJson.dependencies?.["@oh-my-pi/pi-coding-agent"], "^17.0.1")
  assert.equal(packageJson.dependencies?.["big.js"], undefined)
  assert.equal(packageJson.dependencies?.["proper-lockfile"], undefined)
  assert.equal(
    packageJson.scripts?.build,
    "npm run build:types && npm run build:source && npm run build:vendor && npm run format:dist",
  )
  assert.equal(
    packageJson.scripts?.["build:source"],
    "tsc -p tsconfig.build.json && tsc-alias -p tsconfig.build.json",
  )

  assert.equal(
    packageJson.scripts?.["build:types"],
    "rm -rf dist && tsc --noEmit -p tsconfig.json",
  )

  const canonicalSpecUrl = new URL("../spec/project-time.yml", import.meta.url)

  const lockfileBundleUrl = new URL("../dist/vendor/proper-lockfile.js", import.meta.url)
  const lockfileBundle = await readFile(lockfileBundleUrl, "utf8")
  assert.match(lockfileBundle, /node_modules\/proper-lockfile/)
  assert.doesNotMatch(lockfileBundle, /require\(["'](proper-lockfile|graceful-fs|retry|signal-exit)["']\)/)

  const bigBundleUrl = new URL("../dist/vendor/big.js", import.meta.url)
  const bigBundle = await readFile(bigBundleUrl, "utf8")
  assert.match(bigBundle, /node_modules\/big\.js/)
  assert.doesNotMatch(bigBundle, /from ["']big\.js["']/)
  const canonicalSpec = await readFile(canonicalSpecUrl, "utf8")
  assert.match(canonicalSpec, /^feature: project-time$/m)
  assert.doesNotMatch(rawPackageJson, /omp-developer-attention-status/)
  assert.doesNotMatch(canonicalSpec, /developer-attention-status/)
})

test("rewrites source aliases to runtime-safe relative imports", async () => {
  const sourceEntryUrl = new URL("../src/index.ts", import.meta.url)
  const sourceEntry = await readFile(sourceEntryUrl, "utf8")
  assert.match(sourceEntry, /from "@\/extension\/runtime\.js"/)

  const emittedEntryUrl = new URL("../dist/index.js", import.meta.url)
  const emittedEntry = await readFile(emittedEntryUrl, "utf8")
  assert.doesNotMatch(emittedEntry, /from "@\//)
  assert.match(emittedEntry, /from "\.\/extension\/runtime\.js"/)

  // Dynamic import exercises the generated runtime boundary; dist does not exist before the build.
  const emittedModule = await import(emittedEntryUrl.href)
  assert.equal(typeof emittedModule.default, "function")
})

test("ships generated modules with separated declarations", async () => {
  const ledgerUrl = new URL("../dist/billing/infrastructure/spread-ledger.js", import.meta.url)
  const ledger = await readFile(ledgerUrl, "utf8")

  assert.match(ledger, /filePath;\n\n  constructor\(/)
  assert.match(ledger, /}\n\n  async recordPrompt\(/)

  const repositoryIdentityUrl = new URL("../dist/infrastructure/repository-identity.js", import.meta.url)
  const repositoryIdentity = await readFile(repositoryIdentityUrl, "utf8")

  assert.match(repositoryIdentity, /}\n\nfunction repositoryIdentityFromUrl\(/)

  const activeCostUrl = new URL("../dist/billing/calculation/cost-for-active-time.js", import.meta.url)
  const activeCost = await readFile(activeCostUrl, "utf8")

  assert.match(activeCost, /time-constants\.js";\n\nexport function effectivePaidHourlyCost\(/)
  assert.match(activeCost, /export function costForActiveMs\(/)
})
