import assert from "node:assert/strict"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"

import { loadProjectTimeConfigFromFiles } from "../src/config/loader/load-project-time-config-from-files.js"

const PLUGIN_NAME = "omp-project-time"

test("loads canonical plugin settings from disk", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "project-time-config-"))
  const pluginsLockfile = path.join(directory, "omp-plugins.lock.json")
  const projectOverrides = path.join(directory, "missing-overrides.json")

  try {
    await writePluginSettings(pluginsLockfile, {
      activeWindowMinutes: 10,
      label: "first",
    })

    const firstConfig = await loadProjectTimeConfigFromFiles(
      pluginsLockfile,
      projectOverrides,
    )

    assert.equal(firstConfig.activeWindowMinutes, 10)
    assert.equal(firstConfig.label, "first")

    await writePluginSettings(pluginsLockfile, {
      activeWindowMinutes: 3,
      refreshIntervalSeconds: 3,
      label: "second",
    })

    const secondConfig = await loadProjectTimeConfigFromFiles(
      pluginsLockfile,
      projectOverrides,
    )

    assert.equal(secondConfig.activeWindowMinutes, 3)
    assert.equal(secondConfig.refreshIntervalSeconds, 3)
    assert.equal(secondConfig.label, "second")
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test("loads repository attribution mappings from the current setting", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "project-time-config-"))
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

    const config = await loadProjectTimeConfigFromFiles(
      pluginsLockfile,
      projectOverrides,
    )

    assert.deepEqual(
      config.repositoryAttribution.get("github.com/acme/project"),
      {
        project: { id: "acme", label: "Acme" },
        category: { id: "development", label: "Development" },
      },
    )
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test("project overrides win over global plugin settings", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "project-time-config-"))
  const pluginsLockfile = path.join(directory, "omp-plugins.lock.json")
  const projectOverrides = path.join(directory, "plugin-overrides.json")

  try {
    await writePluginSettings(pluginsLockfile, {
      activeWindowMinutes: 10,
      label: "global",
    })
    await writePluginSettings(projectOverrides, {
      activeWindowMinutes: 7,
      label: "project",
    })

    const config = await loadProjectTimeConfigFromFiles(
      pluginsLockfile,
      projectOverrides,
    )

    assert.equal(config.activeWindowMinutes, 7)
    assert.equal(config.label, "project")
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test("throws when project override config is malformed", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "project-time-config-"))
  const pluginsLockfile = path.join(directory, "omp-plugins.lock.json")
  const projectOverrides = path.join(directory, "plugin-overrides.json")

  try {
    await writePluginSettings(pluginsLockfile, {
      activeWindowMinutes: 10,
    })
    await writeFile(projectOverrides, "{")

    await assert.rejects(
      loadProjectTimeConfigFromFiles(pluginsLockfile, projectOverrides),
      /Unable to read Project Time config/,
    )
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test("throws when a config file is malformed", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "project-time-config-"))
  const pluginsLockfile = path.join(directory, "omp-plugins.lock.json")
  const projectOverrides = path.join(directory, "plugin-overrides.json")

  try {
    await writeFile(pluginsLockfile, "{")

    await assert.rejects(
      loadProjectTimeConfigFromFiles(pluginsLockfile, projectOverrides),
      /Unable to read Project Time config/,
    )
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test("rejects a decoded config document with invalid settings", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "project-time-config-"))
  const pluginsLockfile = path.join(directory, "omp-plugins.lock.json")
  const projectOverrides = path.join(directory, "plugin-overrides.json")

  try {
    await writeFile(pluginsLockfile, JSON.stringify({ settings: [] }))

    await assert.rejects(
      loadProjectTimeConfigFromFiles(pluginsLockfile, projectOverrides),
      /settings must be an object/,
    )
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test("rejects invalid repository attribution", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "project-time-config-"))
  const pluginsLockfile = path.join(directory, "omp-plugins.lock.json")
  const projectOverrides = path.join(directory, "missing-overrides.json")

  try {
    await writePluginSettings(pluginsLockfile, {
      repositoryBilling: JSON.stringify({
        repositories: {
          "github.com/acme/project": { project: "invalid" },
        },
      }),
    })

    await assert.rejects(
      loadProjectTimeConfigFromFiles(pluginsLockfile, projectOverrides),
      /Invalid repository attribution/,
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
