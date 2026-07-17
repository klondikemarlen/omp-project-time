import { build } from "esbuild"

const vendorDirectory = "dist/vendor"
const requireBanner = 'import { createRequire } from "node:module"; const require = createRequire(import.meta.url);'

await build({
  allowOverwrite: true,
  banner: { js: requireBanner },
  bundle: true,
  entryPoints: [`${vendorDirectory}/proper-lockfile.js`],
  format: "esm",
  outfile: `${vendorDirectory}/proper-lockfile.js`,
  platform: "node",
})
