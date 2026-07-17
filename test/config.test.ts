import assert from "node:assert/strict"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"

import { loadProjectTimeConfigFromFiles } from "../src/config/loader/load-project-time-config-from-files.js"

const PLUGIN_NAME = "omp-project-time"

test("publishes the v5 OMP settings UI", async () => {
  const manifest = JSON.parse(
    await readFile(new URL("../package.json", import.meta.url), "utf8"),
  ) as { omp: { settings: Record<string, unknown> } }

  assert.deepEqual(manifest.omp.settings, {
    "Active Window Minutes": {
      type: "number",
      default: 5,
      min: 1,
      description:
        "Keeps Project Time active for this many minutes after a user prompt.",
    },
    "Refresh Interval Seconds": {
      type: "number",
      default: 15,
      min: 1,
      description: "Refreshes the active status every this many seconds.",
    },
    "Status Label": {
      type: "string",
      default: "dev",
      description:
        "Shows this lowercase suffix in the status line, for example dev.",
    },
    "Repository Attribution": {
      type: "string",
      default: "{}",
      description:
        "Maps normalized repositories to project, category, and optional task JSON. Enter {} to clear attribution.",
    },
  })
})

test("loads canonical plugin settings from disk", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "project-time-config-"))
  const pluginsLockfile = path.join(directory, "omp-plugins.lock.json")
  const projectOverrides = path.join(directory, "missing-overrides.json")

  try {
    await writePluginSettings(pluginsLockfile, {
      "Active Window Minutes": 10,
      "Status Label": "first",
    })

    const firstConfig = await loadProjectTimeConfigFromFiles(
      pluginsLockfile,
      projectOverrides,
    )

    assert.equal(firstConfig.activeWindowMinutes, 10)
    assert.equal(firstConfig.label, "first")

    await writePluginSettings(pluginsLockfile, {
      "Active Window Minutes": 3,
      "Refresh Interval Seconds": 3,
      "Status Label": "second",
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

test("requires migrating retired setting names", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "project-time-config-"))
  const pluginsLockfile = path.join(directory, "omp-plugins.lock.json")
  const projectOverrides = path.join(directory, "missing-overrides.json")

  try {
    await writePluginSettings(pluginsLockfile, { activeWindowMinutes: 10 })

    await assert.rejects(
      loadProjectTimeConfigFromFiles(pluginsLockfile, projectOverrides),
      /Replace `activeWindowMinutes` with `Active Window Minutes`/,
    )
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
      "Repository Attribution": JSON.stringify({
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

test("treats empty repository attribution as no mapping", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "project-time-config-"))
  const pluginsLockfile = path.join(directory, "omp-plugins.lock.json")
  const projectOverrides = path.join(directory, "missing-overrides.json")

  try {
    await writePluginSettings(pluginsLockfile, {
      "Repository Attribution": "{}",
    })

    const config = await loadProjectTimeConfigFromFiles(
      pluginsLockfile,
      projectOverrides,
    )

    assert.equal(config.repositoryAttribution.size, 0)
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
      "Active Window Minutes": 10,
      "Status Label": "global",
    })
    await writePluginSettings(projectOverrides, {
      "Active Window Minutes": 7,
      "Status Label": "project",
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
      "Active Window Minutes": 10,
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
      "Repository Attribution": JSON.stringify({
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
