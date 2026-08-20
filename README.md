# omp-project-time

OMP plugin that records verifiable, local project-work intervals.

## Intent

OMP exposes model and tool activity but does not retain a provider-neutral log of the work it observes. Project Time records two independent evidence streams:

- `human_active`: prompt-driven collaboration intervals. It is useful context, never a billable-hours claim.
- `agent_turn_elapsed`: elapsed time from an OMP agent turn starting until it ends. It is separate evidence and is never added to another source automatically.

Canonical requirements live in [`spec/project-time.yml`](spec/project-time.yml).

## Behavior

- Only top-level sessions are tracked. Subagents and artifacts do not produce entries.
- A real user prompt keeps the human-active timer alive for `Active Window Minutes`; refreshes do not create activity.
- Automatic entries include their source kind, top-level session, sanitized project label, one-way repository hash, interval bounds, and a coarse activity label, but never a working-directory path. When `origin` resolves, entries also retain a normalized lowercase `host/path` repository identity without a protocol, credential, raw URL, or local filesystem path.
- Before each top-level turn, OMP's configured title model generates the compact status label, while the active model generates a detailed, source-grounded worklog narrative from the current prompt. Labels remain limited to 48 letters or numbers separated by single spaces or hyphens. Narratives retain relevant work-item identifiers, titles, components, and files; the generator is instructed to omit credentials and personal data. If generation produces no valid label, it retains the previous label or uses `General Work`; a missing narrative remains absent.
- Narrative completion runs inside OMP's Bun host; Node remains the development and test runtime.
- Concurrent repositories retain their full independent automatic intervals. Totals can exceed the OMP-active union; that is recorded evidence, not an error.
- Prompt activity does not claim literal desk time or billable duration. Project Time has no manual timer and never writes external time-entry data.
- The status is a dim, keyed OMP hook-status line such as `5m 12s (dev)`. OMP owns its placement and layout.

The plugin writes only through `ctx.ui.setStatus(...)`. OMP renders each extension status in its own keyed line; placement is controlled by OMP's status layout and segment registry.

## Defaults

- `Active Window Minutes`: `5`
- `Refresh Interval Seconds`: `15`
- `Status Label`: `dev`

`Refresh Interval Seconds` controls status display cadence, not interval length.

### Migrate to Version 8.2

On first ledger access, version 8.2 validates and imports `time-log.json` into SQLite. The original JSON file remains untouched as a rollback backup; invalid JSON remains untouched and is not partially imported. Restart OMP after upgrading so older plugin processes do not keep appending to the backup.

### Migrate to version 6

Version 6 keeps the three scalar settings, removes JSON repository attribution, and resets the incompatible local Project Time ledger on first startup. Then remove every retired setting:

```bash
omp plugin config delete omp-project-time activeWindowMinutes
omp plugin config delete omp-project-time refreshIntervalSeconds
omp plugin config delete omp-project-time label
omp plugin config delete omp-project-time repositoryBilling
omp plugin config delete omp-project-time "Repository Attribution"
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

## Commands

```text
/project-time
/project-time entries
/project-time entries --project wrap
/project-time --project wrap
project-time entries --project wrap
```

`/project-time` shows the current project and active interval status. In interactive OMP, `entries` opens the complete versioned local evidence snapshot in OMP's scrollable editor rather than adding raw JSON to chat history.

The installed `project-time entries [--project NAME]` binary writes that same complete JSON snapshot to standard output.

`--project NAME` selects an exact persisted Project Time project label. It may follow the live dashboard or `entries`, for example `/project-time entries --project wrap`. Quote labels containing spaces, such as `/project-time entries --project "Ice Fog Analytics"`. Type `--project ` after a valid OMP view to complete stored project labels.

## Local data

The owner-only SQLite ledger is:

```text
~/.omp/project-time/time-log.sqlite
```

On its first access, version 8.2 validates and transactionally imports a valid `~/.omp/project-time/time-log.json` ledger. The original JSON remains untouched as a rollback backup. Invalid JSON is left untouched and is never partially imported. Restart OMP after upgrading so older plugin processes do not append to the backup.

SQLite stores each automatic evidence entry separately, so recording no longer rewrites the complete ledger. A cross-window lock keeps record-and-update operations safe.

Entries may include `narrative: { text, source }` alongside `activity`, `startAtMs`, and `endAtMs`. `source` is either `generated` or `user_provided`; omitted `narrative` means no description was captured. Project Time deliberately preserves each detailed interval narrative without aggregation or summarization so downstream worklog tools can deduplicate and summarize with the original interval and duration available for review.

### Evidence snapshot v1

`/project-time entries` presents the complete `omp-project-time/evidence` v1 JSON snapshot for inspection or copying; it is never truncated. `project-time entries` writes the same full JSON to standard output. Its read-only object is `{ format, version, entries }`; `entries` contains raw `human_active` and `agent_turn_elapsed` intervals without combining, allocating, or labelling either as billable.

Every entry preserves its stable `id`, source kind, sanitized project and repository identity, interval bounds, creation time, activity, and optional narrative and work item. `workItemAttribution` makes the work-item provenance explicit:

- `explicit_prompt`: the prompt named exactly one issue or pull request.
- `carried_forward`: the prior unambiguous work item remained active.
- `unassigned`: no work item is known.
- `ambiguous`: the prompt named multiple work items, so none was guessed.

An attribution transition creates a new interval segment; Project Time never extends an existing interval across it. SQLite storage is internal: `entries` remains the v1 evidence contract. Valid legacy automatic JSON ledgers without provenance fields are imported with their legacy attribution.

Billing mapping and copyable review-only drafts belong to [Harvest Worklog](https://github.com/klondikemarlen/harvest-worklog). Project Time never maps evidence to billing targets, calculates billable time, or writes Harvest data.

Entries may also include `workItem: { kind, number, repository?, source: "user_provided" }` when a prompt explicitly names a GitHub issue or pull request. The active work item persists through unrelated prompts, and its attribution states above let downstream tools distinguish that carry-forward context from an explicit reference.

SQLite migration ignores v7.7 manual timer state and manual entries while preserving valid automatic evidence. Earlier incompatible legacy data is intentionally not imported.

## Development

Development and test tooling require Node.js 22.13 or newer. OMP continues to host the plugin with Bun.

```bash
npm install
npm test
npm run build
npm pack --dry-run
```

Source modules use `@/` imports rooted at `src/`. `tsc-alias` rewrites them to relative `.js` imports in `dist/`, so the published ESM plugin has no unresolved source aliases. OMP hosts it with Bun; Node runs the development and test tooling.

## Troubleshooting

- `omp plugin list` should show `omp-project-time`.
- `omp plugin config list omp-project-time` shows current settings.
- Status placement is OMP-managed; Project Time only writes its keyed hook status.
