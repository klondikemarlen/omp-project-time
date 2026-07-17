import assert from "node:assert/strict"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"

import { loadDeveloperCostConfigFromFiles } from "../src/index.js"

const PLUGIN_NAME = "omp-project-time"

test("loads canonical plugin settings from disk", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "developer-cost-config-"))
  const pluginsLockfile = path.join(directory, "omp-plugins.lock.json")
  const projectOverrides = path.join(directory, "missing-overrides.json")

  try {
    await writePluginSettings(pluginsLockfile, {
      annualGrossSalary: 90_000,
      label: "first",
      locale: "fr-CA",
    })

    const firstConfig = await loadDeveloperCostConfigFromFiles(pluginsLockfile, projectOverrides)

    assert.equal(firstConfig.annualGrossSalary, 90_000)
    assert.equal(firstConfig.label, "first")
    assert.equal(firstConfig.locale, "fr-CA")

    await writePluginSettings(pluginsLockfile, {
      annualGrossSalary: 108_000,
      refreshIntervalSeconds: 3,
      label: "second",
    })

    const secondConfig = await loadDeveloperCostConfigFromFiles(pluginsLockfile, projectOverrides)

    assert.equal(secondConfig.annualGrossSalary, 108_000)
    assert.equal(secondConfig.refreshIntervalSeconds, 3)
    assert.equal(secondConfig.label, "second")
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test("loads repository timesheet mappings from the current setting", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "developer-cost-config-"))
  const pluginsLockfile = path.join(directory, "omp-plugins.lock.json")
  const projectOverrides = path.join(directory, "missing-overrides.json")

  try {
    await writePluginSettings(pluginsLockfile, {
      repositoryBilling: JSON.stringify({
        repositories: {
          "github.com/acme/project": {
            project: { id: "acme", label: "Acme" },
            category: { id: "development", label: "Development" },
          },
        },
      }),
    })

    const config = await loadDeveloperCostConfigFromFiles(pluginsLockfile, projectOverrides)

    assert.deepEqual(config.billableTime.policiesByRepository.get("github.com/acme/project"), {
      project: { id: "acme", label: "Acme" },
      category: { id: "development", label: "Development" },
    })
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test("loads former scalar and billable policy settings", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "developer-cost-config-"))
  const pluginsLockfile = path.join(directory, "omp-plugins.lock.json")
  const projectOverrides = path.join(directory, "missing-overrides.json")

  try {
    await writePluginSettings(pluginsLockfile, {
      monthlySalary: 6_500,
      billableTime: JSON.stringify({
        defaultClient: "acme",
        clients: {
          acme: { label: "Acme", attentionRatePerHour: "100", aiRatePerHour: "25" },
        },
      }),
    })

    const config = await loadDeveloperCostConfigFromFiles(pluginsLockfile, projectOverrides)

    assert.equal(config.annualGrossSalary, 78_000)
    assert.equal(config.billableTime.defaultClient?.id, "acme")
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
      annualGrossSalary: 78_000,
      label: "global",
    })
    await writePluginSettings(projectOverrides, {
      monthlySalary: 9_000,
      label: "project",
    })

    const config = await loadDeveloperCostConfigFromFiles(pluginsLockfile, projectOverrides)

    assert.equal(config.annualGrossSalary, 108_000)
    assert.equal(config.label, "project")
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
      annualGrossSalary: 78_000,
    })
    await writeFile(projectOverrides, "{")

    await assert.rejects(
      loadDeveloperCostConfigFromFiles(pluginsLockfile, projectOverrides),
      /Unable to read Project Time config/,
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
      /Unable to read Project Time config/,
    )
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test("rejects a decoded config document with invalid settings", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "developer-cost-config-"))
  const pluginsLockfile = path.join(directory, "omp-plugins.lock.json")
  const projectOverrides = path.join(directory, "plugin-overrides.json")

  try {
    await writeFile(pluginsLockfile, JSON.stringify({ settings: [] }))

    await assert.rejects(
      loadDeveloperCostConfigFromFiles(pluginsLockfile, projectOverrides),
      /settings must be an object/,
    )
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test("rejects unsupported monetary locales", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "developer-cost-config-"))
  const pluginsLockfile = path.join(directory, "omp-plugins.lock.json")
  const projectOverrides = path.join(directory, "plugin-overrides.json")

  try {
    await writePluginSettings(pluginsLockfile, { locale: "zz-ZZ" })

    await assert.rejects(
      loadDeveloperCostConfigFromFiles(pluginsLockfile, projectOverrides),
      /locale must be a BCP 47 locale supported by Intl\.NumberFormat/,
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
