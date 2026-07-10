import assert from "node:assert/strict"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"

import { loadDeveloperCostConfigFromFiles } from "../src/index.js"

const PLUGIN_NAME = "omp-developer-attention-status"
const LEGACY_PLUGIN_NAME = "omp-developer-cost-status"

test("loads canonical plugin settings from disk", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "developer-cost-config-"))
  const pluginsLockfile = path.join(directory, "omp-plugins.lock.json")
  const projectOverrides = path.join(directory, "missing-overrides.json")

  try {
    await writePluginSettings(pluginsLockfile, {
      monthlySalary: 7_500,
      label: "first",
    })

    const firstConfig = await loadDeveloperCostConfigFromFiles(pluginsLockfile, projectOverrides)

    assert.equal(firstConfig.monthlySalary, 7_500)
    assert.equal(firstConfig.label, "first")

    await writePluginSettings(pluginsLockfile, {
      monthlySalary: 9_000,
      refreshIntervalSeconds: 3,
      label: "second",
    })

    const secondConfig = await loadDeveloperCostConfigFromFiles(pluginsLockfile, projectOverrides)

    assert.equal(secondConfig.monthlySalary, 9_000)
    assert.equal(secondConfig.refreshIntervalSeconds, 3)
    assert.equal(secondConfig.label, "second")
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test("project overrides win over global plugin settings", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "developer-cost-config-"))
  const pluginsLockfile = path.join(directory, "omp-plugins.lock.json")
  const projectOverrides = path.join(directory, "plugin-overrides.json")

  try {
    await writePluginSettings(pluginsLockfile, {
      monthlySalary: 6_500,
      label: "global",
    })
    await writePluginSettings(projectOverrides, {
      monthlySalary: 9_000,
      label: "project",
    })

    const config = await loadDeveloperCostConfigFromFiles(pluginsLockfile, projectOverrides)

    assert.equal(config.monthlySalary, 9_000)
    assert.equal(config.label, "project")
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test("loads legacy-only plugin settings after the package identity migration", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "developer-cost-config-"))
  const pluginsLockfile = path.join(directory, "omp-plugins.lock.json")
  const projectOverrides = path.join(directory, "missing-overrides.json")

  try {
    await writePluginLockfile(pluginsLockfile, {
      [LEGACY_PLUGIN_NAME]: {
        monthlySalary: 7_500,
        label: "legacy",
      },
    })

    const config = await loadDeveloperCostConfigFromFiles(pluginsLockfile, projectOverrides)

    assert.equal(config.monthlySalary, 7_500)
    assert.equal(config.label, "legacy")
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test("applies legacy and canonical settings in migration precedence order", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "developer-cost-config-"))
  const pluginsLockfile = path.join(directory, "omp-plugins.lock.json")
  const projectOverrides = path.join(directory, "plugin-overrides.json")

  try {
    await writePluginLockfile(pluginsLockfile, {
      [LEGACY_PLUGIN_NAME]: {
        monthlySalary: 1_000,
        hoursPerWeek: 35,
      },
      [PLUGIN_NAME]: {
        monthlySalary: 2_000,
        hoursPerWeek: 36,
        weeksPerYear: 50,
      },
    })
    await writePluginLockfile(projectOverrides, {
      [LEGACY_PLUGIN_NAME]: {
        monthlySalary: 3_000,
        weeksPerYear: 51,
        activeWindowMinutes: 4,
      },
      [PLUGIN_NAME]: {
        monthlySalary: 4_000,
        activeWindowMinutes: 5,
      },
    })

    const config = await loadDeveloperCostConfigFromFiles(pluginsLockfile, projectOverrides)

    assert.equal(config.monthlySalary, 4_000)
    assert.equal(config.hoursPerWeek, 36)
    assert.equal(config.weeksPerYear, 51)
    assert.equal(config.activeWindowMinutes, 5)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test("throws when project override config is malformed", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "developer-cost-config-"))
  const pluginsLockfile = path.join(directory, "omp-plugins.lock.json")
  const projectOverrides = path.join(directory, "plugin-overrides.json")

  try {
    await writePluginSettings(pluginsLockfile, {
      monthlySalary: 6_500,
    })
    await writeFile(projectOverrides, "{")

    await assert.rejects(
      loadDeveloperCostConfigFromFiles(pluginsLockfile, projectOverrides),
      /Unable to read developer cost config/,
    )
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test("throws when a config file is malformed", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "developer-cost-config-"))
  const pluginsLockfile = path.join(directory, "omp-plugins.lock.json")
  const projectOverrides = path.join(directory, "plugin-overrides.json")

  try {
    await writeFile(pluginsLockfile, "{")

    await assert.rejects(
      loadDeveloperCostConfigFromFiles(pluginsLockfile, projectOverrides),
      /Unable to read developer cost config/,
    )
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

async function writePluginSettings(
  filePath: string,
  settings: Record<string, unknown>,
): Promise<void> {
  await writePluginLockfile(filePath, {
    [PLUGIN_NAME]: settings,
  })
}

async function writePluginLockfile(
  filePath: string,
  settings: Record<string, Record<string, unknown>>,
): Promise<void> {
  const content = JSON.stringify({
    settings,
  })

  await writeFile(filePath, content)
}
