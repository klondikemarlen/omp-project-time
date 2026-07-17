# omp-project-time

OMP plugin that records verifiable, local project-work intervals.

## Intent

OMP exposes model and tool activity but does not retain a provider-neutral log of the work it observes. Project Time records two independent evidence streams for each top-level OMP session:

- `human_active`: prompt-driven collaboration intervals. This is the default report and timesheet source.
- `agent_turn_elapsed`: elapsed time from an OMP agent turn starting until it ends. It is separate evidence and is never added to human time automatically.

Canonical requirements live in [`spec/project-time.yml`](spec/project-time.yml).

## Behavior

- Only top-level sessions are tracked. Subagents and artifacts do not produce entries.
- A real user prompt keeps the human-active timer alive for `Active Window Minutes`; refreshes do not create activity.
- Every entry is immutable and includes its source kind, top-level session, sanitized repository identity, interval bounds, and configured project/category/task attribution when available.
- Concurrent repositories retain their full independent intervals. Totals can exceed the OMP-active union; that is recorded evidence, not an error.
- Project Time does not claim literal desk time. The union is an OMP-active reference only.
- The status is a dim, keyed OMP hook-status line such as `5m 12s (dev)`. OMP owns its placement and layout.

The plugin writes only through `ctx.ui.setStatus(...)`. With `@oh-my-pi/pi-coding-agent` `17.0.1` or newer, each keyed extension status is rendered on its own hook-status line; plugin status cannot be placed inline beside OMP's built-in usage and cost segments.

## Defaults

- `Active Window Minutes`: `5`
- `Refresh Interval Seconds`: `15`
- `Status Label`: `dev`
- `Repository Attribution`: `{}`

`Refresh Interval Seconds` controls status display cadence, not interval length. Version 5 replaces the lower-camel-case names; Project Time rejects the retired names instead of silently dropping their values.

### Migrate from version 4

Re-enter custom values under the new labels in OMP’s plugin Settings screen. Before deleting `repositoryBilling`, copy its JSON into `Repository Attribution`. Then remove the retired settings:

```bash
omp plugin config delete omp-project-time activeWindowMinutes
omp plugin config delete omp-project-time refreshIntervalSeconds
omp plugin config delete omp-project-time label
omp plugin config delete omp-project-time repositoryBilling
```

## Install

From GitHub:

```bash
omp plugin install github:klondikemarlen/omp-project-time
```

For local development:

```bash
git clone https://github.com/klondikemarlen/omp-project-time.git
cd omp-project-time
npm install
omp plugin install /absolute/path/to/omp-project-time
```

OMP symlinks local installs and watches them for changes. Restart OMP or run `/reload-plugins`, then run `/project-time` to confirm the extension loaded.

## Configure repository attribution

OMP renders plugin setting keys as labels, so Project Time uses Title Case names with units. `Repository Attribution` is the one advanced scalar setting: it configures attribution, not billing. Enter `{}` to clear an existing mapping.

Each normalized GitHub repository can map to a project, category, and optional task. Mapped values are copied into entries when recorded; changing configuration never rewrites history.

```json
{
  "repositories": {
    "github.com/acme/project": {
      "project": { "id": "acme", "label": "Acme" },
      "category": { "id": "development", "label": "Development" },
      "task": "Project work"
    }
  }
}
```

OMP settings are scalar, so set the JSON as one string:

```bash
omp plugin config set omp-project-time "Repository Attribution" '{"repositories":{"github.com/acme/project":{"project":{"id":"acme","label":"Acme"},"category":{"id":"development","label":"Development"},"task":"Project work"}}}'
```

Unmapped repositories still record local intervals with a sanitized project name and default attribution. Project Time never persists working-directory paths, raw remote URLs, credentials, prompts, transcripts, tool output, artifacts, session files, file paths, or model metadata.

## Commands

```text
/project-time
/project-time summary
/project-time history
/project-time report
/project-time report human raw
/project-time report human split
/project-time report human weighted '{"<repository-id>": 2}'
/project-time report agent split
```

`/project-time` shows the current project and active interval status. `summary` shows the top-level session's active time and prompt count. `history` shows local human-active and agent-turn intervals for the current repository.

`report` emits local JSON. It defaults to both source kinds and all allocation modes:

- `raw`: one total per repository/project/category/task. Concurrent durations remain fully attributed.
- `split`: divides every overlapping interval equally across active repositories.
- `weighted`: divides overlap by the supplied positive per-repository weights; omitted repositories have weight `1`.

Every report contains `ompActiveUnionMs`, the union of its source-kind intervals. It is an OMP-active reference, not literal desk time. `agent` selects `agent_turn_elapsed`; otherwise reports use `human_active`. The two sources are never combined.

## Local data

The owner-only ledger is:

```text
~/.omp/project-time/time-log.json
```

The first launch after this major data-model release clears incompatible legacy Project Time, developer-cost, and billable ledgers. Historical data is intentionally not converted.

## Development

```bash
npm install
npm test
npm run build
npm pack --dry-run
```

Source modules use `@/` imports rooted at `src/`. `tsc-alias` rewrites them to relative `.js` imports in `dist/`, so the published Node ESM plugin has no unresolved source aliases.

## Troubleshooting

- `omp plugin list` should show `omp-project-time`.
- `omp plugin config list omp-project-time` shows current settings.
- Status placement is OMP-managed; Project Time only writes its keyed hook status.
