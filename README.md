# omp-developer-cost-status

OMP plugin that adds a developer-time cost meter to the footer status line.

## Intent

**WHY this plugin exists:** OMP shows model and tool activity, but it does not track what the
developer's own active time costs while they drive a session.

**WHAT this plugin produces:** A footer status segment like `$0.16 (dev)` that stays active after
each prompt and refreshes on a configurable cadence while the session is active.

Canonical feature requirements live in [`spec/developer-cost-status.yml`](spec/developer-cost-status.yml).

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
- **1.0 scope:** Each top-level session is tracked independently. Multi-session spread billing is a
  planned roadmap item, not part of the implemented 1.0 contract.

## Behavior

The plugin writes status via `ctx.ui.setStatus(...)`.

Current OMP limitation:

- plugin status renders on the separate hook-status line below the main prompt status bar
- it does **not** render inline beside the built-in usage/cost segment
- the extra vertical gap belongs to OMP's hook-status layout, not this plugin's text

Display style:

- format: `$3.13 (dev)`
- dim hook-status styling
- refreshes every `refreshIntervalSeconds` while the session is active

Billing behavior:

- each prompt keeps billing alive for `activeWindowMinutes`
- cost accrues continuously during active time and stops when the active window expires
- accumulated cost is stored as a precise decimal string and formatted only for display
- if you resume the same session id later, the plugin reloads the last persisted state and keeps
  adding to it
- a new session id starts a new meter

## Defaults

The plugin ships with simple defaults:

- `monthlySalary`: `6500`
- `hoursPerWeek`: `40`
- `weeksPerYear`: `52`
- `activeWindowMinutes`: `5`
- `refreshIntervalSeconds`: `15`
- `label`: `dev`

That yields a default 5-minute developer cost of about `$3.13`, or about `$0.16` per active
15-second refresh.

If you work `49` weeks per year instead, the same defaults produce about `$3.32` per 5-minute
window.

## Formula

```text
activeCost = monthlySalary × 12 / (hoursPerWeek × weeksPerYear × 60 × 60 × 1000) × activeMilliseconds
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

15-second refresh = $0.16
5-minute active window = $3.13
```

49-week example:

```text
monthlySalary = 6500
hoursPerWeek = 40
weeksPerYear = 49
activeWindowMinutes = 5

5-minute active window = $3.32
```

## Install

From GitHub:

```bash
omp install github:klondikemarlen/omp-developer-cost-status
```

For local development from a checkout:

```bash
git clone https://github.com/klondikemarlen/omp-developer-cost-status.git
cd omp-developer-cost-status
npm install
omp install /absolute/path/to/omp-developer-cost-status
```

Replace `/absolute/path/to/omp-developer-cost-status` with your checkout path.

OMP symlinks a local path install and watches it for changes.

After install, restart OMP if it is already running, or run `/reload-plugins`.

Then run `/developer-cost-status` once to confirm the extension loaded.

## Runtime support

- Node.js: `>=20.6.0`
- OMP: tested against `@oh-my-pi/pi-coding-agent` `^16.1.16`

The package ships its canonical spec in `spec/developer-cost-status.yml` so installed artifacts carry
the same behavior contract as the repository.

## Configure plugin settings

Inspect current settings:

```bash
omp plugin config list omp-developer-cost-status
```

Set a custom salary:

```bash
omp plugin config set omp-developer-cost-status monthlySalary 9000
```

Set custom working time assumptions:

```bash
omp plugin config set omp-developer-cost-status hoursPerWeek 37.5
omp plugin config set omp-developer-cost-status weeksPerYear 49
omp plugin config set omp-developer-cost-status activeWindowMinutes 5
omp plugin config set omp-developer-cost-status refreshIntervalSeconds 10
omp plugin config set omp-developer-cost-status label dev
```

Setting changes are picked up on the next status refresh while a session is active. With the
default settings, that means within about 15 seconds. You only need `/reload-plugins` or a
restart after changing plugin code or install state.

## Status command

```text
/developer-cost-status
```

It shows the current meter total for the active top-level session.

## Development

```bash
npm install
npm test
npm run build
npm pack --dry-run
```

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

- `omp plugin list` should show `omp-developer-cost-status`.
- `omp plugin config list omp-developer-cost-status` should show the current settings.
- The status text is rendered by `ctx.ui.setStatus(...)`, so it appears on OMP's separate
  hook-status line rather than inline beside the built-in usage/cost segment.
