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
- Every entry includes its source kind, top-level session, sanitized project label, one-way repository hash, interval bounds, and a coarse activity label. When `origin` resolves, it also retains a normalized lowercase `host/path` repository identity without a protocol, credential, raw URL, or local filesystem path.
- Before each top-level turn, OMP's configured title model generates the compact status label, while the active model generates a detailed, source-grounded worklog narrative from the current prompt. Labels remain limited to 48 letters or numbers separated by single spaces or hyphens. Narratives retain relevant work-item identifiers, titles, components, and files; the generator is instructed to omit credentials and personal data. If generation produces no valid label, it retains the previous label or uses `General Work`; a missing narrative remains absent.
- Narrative completion runs inside OMP's Bun host; Node remains the development and test runtime.
- Concurrent repositories retain their full independent intervals. Totals can exceed the OMP-active union; that is recorded evidence, not an error.
- Project Time does not claim literal desk time. The union is an OMP-active reference only.
- The status is a dim, keyed OMP hook-status line such as `5m 12s (dev)`. OMP owns its placement and layout.

The plugin writes only through `ctx.ui.setStatus(...)`. With `@oh-my-pi/pi-coding-agent` `17.0.1` or newer, each keyed extension status is rendered on its own hook-status line; plugin status cannot be placed inline beside OMP's built-in usage and cost segments.

## Defaults

- `Active Window Minutes`: `5`
- `Refresh Interval Seconds`: `15`
- `Status Label`: `dev`

`Refresh Interval Seconds` controls status display cadence, not interval length.

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
/project-time summary
/project-time history
/project-time report
/project-time report human split
/project-time report agent raw
/project-time report human weighted '{"<repository-id>": 2}'
/project-time report json
/project-time report json human raw
/project-time --project wrap
/project-time summary --project wrap
/project-time history --project wrap
/project-time report human split --project wrap
```

`/project-time` shows the current project and active interval status. `summary` shows the top-level session name, active time, automatic activity, prompt count, and most recent prompt time. `history` shows local human-active and agent-turn intervals for the current repository, including each stored narrative beneath its compact activity label.

Append `--project NAME` to any view to select the exact persisted Project Time project label from the local ledger, for example `--project wrap`. The selected dashboard and summary are explicitly ledger views because another project's live session state is unavailable. Targeted history also labels current activity as unavailable rather than attributing this session to the selected project. Reports preserve full-ledger concurrent allocation before returning only the selected project. Type `--project ` to complete stored project labels.

Activity labels are generated for each top-level turn by OMP's configured title model. There is no manual activity command.

`report` is a concise human-active, raw-allocation summary. Add `agent`, `split`, or `weighted` to select an evidence source or allocation policy. `report json` is the explicit machine-readable form: without further arguments it includes both sources and all allocation modes; add a source and mode for one JSON report.

- `raw`: one total per sanitized project label. Concurrent durations remain fully attributed.
- `split`: divides every overlapping interval equally across active repositories.
- `weighted`: divides overlap by the supplied positive per-repository weights; omitted repositories have weight `1`.

Every report contains `ompActiveUnionMs`, the union of its source-kind intervals. It is an OMP-active reference, not literal desk time. `agent` selects `agent_turn_elapsed`; otherwise reports use `human_active`. The two sources are never combined.

## Local data

The owner-only ledger is:

```text
~/.omp/project-time/time-log.json
```

It is a single JSON ledger guarded by a cross-window lock and atomically replaced. Reports read the whole local ledger; SQLite would add schema and dependency overhead without a query or transaction need.

Entries may include `narrative: { text, source }` alongside `activity`, `startAtMs`, and `endAtMs`. `source` is either `generated` or `user_provided`; omitted `narrative` means no description was captured. Project Time deliberately preserves each detailed interval narrative without aggregation or summarization so downstream worklog tools can deduplicate and summarize with the original interval and duration available for review.

Entries may also include `workItem: { kind, number, repository?, source: "user_provided" }` when a prompt explicitly names a GitHub issue or pull request. The active work item persists through unrelated prompts, so downstream tools can group raw intervals without inferring context from activity labels or narratives.

The first launch after this major data-model release clears incompatible legacy Project Time, developer-cost, and billable ledgers. Historical data is intentionally not converted.

## Development

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
