# omp-project-time

OMP plugin that records project time, developer attention, and separately rated AI work.

## Intent

**WHY this plugin exists:** OMP shows model and tool activity, but it does not track the
developer attention consumed while they drive a session.

**WHAT this plugin produces:** A compact footer status segment like `CA$0.16 (dev)` that stays
active after each prompt, plus an on-demand summary of project time, active time, and prompts.

Canonical feature requirements live in [`spec/project-time.yml`](spec/project-time.yml).

**Decision Rules:**
- **Prompt-driven billing:** Only user agent prompts start or extend the timer.
- **Five-minute liveness:** A session is active only if the user sent a prompt within the last
  `activeWindowMinutes`.
- **Configurable refresh:** The UI refreshes every `refreshIntervalSeconds` while active; this
  controls display cadence, not the billing window size.
- **Continuous active-time display:** The number changes by the cost of elapsed active time on each
  refresh. Cost is stored precisely and rounded only when rendering status text.
- **Session-scoped meter:** Billing is keyed to the current top-level session id. Resume the same
  session and the meter continues.
- **Top-level only:** Subagent and artifact sessions do not get their own developer meter.
- **Attention metrics:** Prompt count and active milliseconds are persisted per top-level session;
  detailed metrics are shown only by the status command.
- **No inferred corrections:** The plugin does not classify corrections, nudges, or outcomes from
  prompt text; reliable correction telemetry needs richer OMP core signals.
- **Spread billing:** Overlapping top-level sessions divide each elapsed cost interval equally;
  per-session active milliseconds remain their full elapsed active time.

## Behavior

The plugin writes status via `ctx.ui.setStatus(...)`.

Current OMP limitation:

- plugin status renders on the separate hook-status line below the main prompt status bar
- it does **not** render inline beside the built-in usage/cost segment
- the extra vertical gap belongs to OMP's hook-status layout, not this plugin's text

Display style:

- format: `CA$3.13 (dev)`
- dim hook-status styling
- refreshes every `refreshIntervalSeconds` while the session is active

Billing and attention behavior:

- each top-level prompt increments the session prompt count and keeps billing alive for
  `activeWindowMinutes`
- cost and active milliseconds accrue together until the active window expires
- accumulated cost is stored as a precise decimal string and formatted only for display
- if you resume the same session id later, the plugin reloads its cost, active time, and prompt
  count
- overlapping active top-level sessions divide each elapsed cost interval equally
- the shared ledger coordinates overlap across plugin runners and retains settled session totals for
  safe resume
- a new session id starts a new meter

## Defaults

The plugin ships with simple CAD defaults:

- `monthlySalary`: `6500`
- `hoursPerWeek`: `40`
- `weeksPerYear`: `52`
- `activeWindowMinutes`: `5`
- `refreshIntervalSeconds`: `15`
- `label`: `dev`

That yields a default 5-minute developer cost of about `CA$3.13`, or about `CA$0.16` per active
15-second refresh. If you work `49` weeks per year instead, the same defaults produce about
`CA$3.32` per 5-minute window.

## Formula

```text
activeCost = monthlySalary × 12 / (hoursPerWeek × weeksPerYear × 60 × 60 × 1000) × activeMilliseconds
sharedSessionCost = activeCost / activeTopLevelSessionCount for each overlapping interval
refreshCost = activeCost where activeMilliseconds = refreshIntervalSeconds × 1000
windowRate = activeCost where activeMilliseconds = activeWindowMinutes × 60 × 1000
```

Default example:

```text
monthlySalary = 6500
hoursPerWeek = 40
weeksPerYear = 52
activeWindowMinutes = 5
refreshIntervalSeconds = 15

15-second refresh = CA$0.16
5-minute active window = CA$3.13
```

49-week example:

```text
monthlySalary = 6500
hoursPerWeek = 40
weeksPerYear = 49
activeWindowMinutes = 5

5-minute active window = CA$3.32
```

## Install

From GitHub:

```bash
omp plugin install github:klondikemarlen/omp-project-time
```

For local development from a checkout:

```bash
git clone https://github.com/klondikemarlen/omp-project-time.git
cd omp-project-time
npm install
omp plugin install /absolute/path/to/omp-project-time
```

Replace `/absolute/path/to/omp-project-time` with your checkout path.

OMP symlinks a local path install and watches it for changes.

After install, restart OMP if it is already running, or run `/reload-plugins`.

Then run `/project-time` once to confirm the extension loaded.

## CAD-only local data reset

Project Time records and presents monetary values in CAD. On its first startup after this release,
it deletes existing local Project Time, `omp-developer-attention-status`, and developer-cost ledger
data, then starts a fresh CAD-only ledger. It does not convert or preserve historical records.
Plugin settings remain in OMP configuration; a legacy billable `currency` field is ignored.

## Runtime support

- Node.js: `>=20.6.0`
- OMP: tested against `@oh-my-pi/pi-coding-agent` `^16.1.16`

The package ships its canonical spec in `spec/project-time.yml` so installed artifacts carry the
same behavior contract as the repository.

## Configure plugin settings

Inspect current settings:

```bash
omp plugin config list omp-project-time
```

Set a custom salary:

```bash
omp plugin config set omp-project-time monthlySalary 9000
```

Set custom working time assumptions:

```bash
omp plugin config set omp-project-time hoursPerWeek 37.5
omp plugin config set omp-project-time weeksPerYear 49
omp plugin config set omp-project-time activeWindowMinutes 5
omp plugin config set omp-project-time refreshIntervalSeconds 10
omp plugin config set omp-project-time label dev
```

Setting changes are picked up on the next status refresh while a session is active. With the
default settings, that means within about 15 seconds. You only need `/reload-plugins` or a
restart after changing plugin code or install state.

### Billable clocks

Configure a client policy with positive CAD hourly rates. Setting `defaultClient` makes the active
Git repository the billable project target; its project name defaults to the repository name.
`projects` optionally replaces that displayed name, while `categories` assigns a provider-neutral
category ID and label to new records for a specific normalized `github.com/owner/repository`
identity. `repositories` remains available when a repository needs a client policy other than
`defaultClient`.

```json
{
  "defaultClient": "icefog",
  "clients": {
    "icefog": {
      "label": "Ice Fog Analytics",
      "attentionRatePerHour": "120",
      "aiRatePerHour": "30"
    }
  },
  "projects": {
    "github.com/icefoganalytics/wrap": "WRAP Support"
  },
  "categories": {
    "github.com/icefoganalytics/wrap": {
      "id": "programming",
      "label": "Programming"
    }
  },
  "repositories": {
    "github.com/icefoganalytics/other-project": "icefog"
  }
}
```

`defaultClient` is opt-in: Project Time never infers a rate or category. New records snapshot the
client, repository, project identity, project name, category, and rate. Project and category
attribution stay provider-neutral; they are not Harvest project or task mappings.

Each qualifying top-level prompt writes one five-minute attention token and records its AI interval
until `turn_end` or shutdown. Records are local append-only files at
`~/.omp/project-time/attention-tokens.ndjson` and
`~/.omp/project-time/ai-intervals.ndjson`.

When an interval first settles, the plugin records an explicit user session title. When its host
exposes title generation, it records a bounded generated description; otherwise it records
`Unlabeled billable work`. It refreshes the description after compaction and at shutdown.
Raw prompt text, transcripts, tool output, artifacts,
and model metadata are never persisted.

Configure it as one JSON string:

```bash
omp plugin config set omp-project-time billableTime '{"defaultClient":"icefog","clients":{"icefog":{"label":"Ice Fog Analytics","attentionRatePerHour":"120","aiRatePerHour":"30"}},"projects":{"github.com/icefoganalytics/wrap":"WRAP Support"},"categories":{"github.com/icefoganalytics/wrap":{"id":"programming","label":"Programming"}}}'
```

## Status command

```text
/project-time
/project-time summary
/project-time billable
/project-time billable preview
/project-time history
```

Type `/project-time ` (including the trailing space) to let OMP offer these modes. The package and
command are named `omp-project-time` and `/project-time`. The default command posts a visible
dashboard with the current Git project, developer meter, billable-policy state, and every explicit
command. `summary` reports its session id, project time cost, active time, prompt count, and the last
prompt's age and timestamp. It does not infer corrections, nudges, or outcomes.
`billable` reports separately grouped attention-token and AI-interval units, durations, and
snapshotted rates/currencies; its displayed amounts round only at the presentation boundary.
`billable preview` emits local provider-neutral JSON entries with client
and project attribution, source-specific timestamps, exact durations, snapshotted rates/currencies,
and the recorded description. It performs no network operation and does not define an
external-system payload or integration.
`history` reports the current Git project, settled developer meter, and recent local developer-time
intervals and billable records for that repository. It clearly distinguishes disabled billable tracking
from no records and does not send data to an external service.

## Local project time log

The plugin records top-level developer-attention intervals automatically in Git repositories. There
is no time-log command and no user-entered project label. It resolves the current repository in the
background, uses a sanitized remote repository name when available (otherwise `local-repository`),
and stores a one-way repository identity hash so same-named repositories stay distinct.

The owner-only default artifacts are:

```text
~/.omp/project-time/time-log.json
~/.omp/project-time/time-log.json.summary.json
```

The raw ledger contains automatic intervals. The summary artifact is refreshed after every recorded
interval and contains 5-, 10-, and 15-minute date/repository rollups, allocation time (the sum of
repository intervals, including intentional overlap), and wall-clock time (merged elapsed
intervals). The plugin skips attribution outside a Git repository without affecting developer-cost
tracking.

Repository resolution never persists the working-directory path, raw remote URL, credentials,
prompts, assignments, transcripts, tool output, artifacts, session files, file paths, or model
metadata.

## Development

```bash
npm install
npm test
npm run build
npm pack --dry-run
```

Source modules use `@/` imports rooted at `src/`. `tsc-alias` rewrites them to relative `.js`
imports in `dist/`, so the published Node ESM plugin has no unresolved source alias.

## Development workflow

For public user-facing changes, use the GitHub feature issue and pull request templates:

1. Create a GitHub issue with the user story and acceptance criteria.
2. Create a branch named for the issue.
3. Open a pull request linked to the issue.
4. Review the diff and run the smallest tests that cover the change.
5. Merge only after the PR is reviewed and checks pass.
6. For published changes, merge first, then bump the package version and changelog on `main`.
7. Reinstall from the remote source and verify the installed plugin.

## Troubleshooting

- `omp plugin list` should show `omp-project-time`.
- `omp plugin config list omp-project-time` should show the current settings.
- The status text is rendered by `ctx.ui.setStatus(...)`, so it appears on OMP's separate
  hook-status line rather than inline beside the built-in usage/cost segment.
