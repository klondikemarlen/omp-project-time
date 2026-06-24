# omp-developer-cost-status

OMP plugin that adds a developer-time cost meter to the footer status line.

## Intent

**WHY this plugin exists:** OMP shows model and tool activity, but it does not track what the developer's own active time costs while they drive a session.

**WHAT this plugin produces:** A footer status segment like `$3.33 (dev)` that accrues in 5-minute active windows and resumes with the same session id.

**Decision Rules:**
- **Prompt-driven billing:** Only real agent prompts bill time. Slash commands and shell shortcuts do not.
- **Session-scoped meter:** Billing is keyed to the current top-level session id. Resume the same session and the meter continues.
- **Top-level only:** Subagent and artifact sessions do not get their own developer meter.
- **Public-safe defaults:** The built-in defaults are generic Canadian full-stack developer values, not a personal salary.

## Behavior

The plugin writes footer status via OMP's extension UI status API.

Display style:

- format: `$4.76 (dev)`
- lowercase suffix in parentheses
- dim footer styling

Billing behavior:

- each prompt activates billing for `activeWindowMinutes`
- only full elapsed windows are billed
- if you resume the same session id later, the plugin reloads the last persisted state and keeps adding to it
- a new session id starts a new meter

## Defaults

The plugin ships with generic Canadian defaults:

- `annualSalary`: `80000`
- `hoursPerWeek`: `40`
- `weeksPerYear`: `50`
- `activeWindowMinutes`: `5`
- `currencyCode`: `CAD`
- `label`: `dev`

That yields a default 5-minute developer cost of about `$3.33`.

## Formula

```text
windowRate = annualSalary / (hoursPerWeek × weeksPerYear × 60) × activeWindowMinutes
```

Default example:

```text
annualSalary = 80000
hoursPerWeek = 40
weeksPerYear = 50
activeWindowMinutes = 5

windowRate = $3.33
```

## Install

From GitHub:

```bash
omp install github:klondikemarlen/omp-developer-cost-status
```

For local development from a checkout:

```bash
git clone git@github.com:klondikemarlen/omp-developer-cost-status.git
cd omp-developer-cost-status
npm install
omp install "$PWD"
```

OMP symlinks a local path install and watches it for changes.

After install, restart OMP if it is already running.

## Configure plugin settings

Inspect current settings:

```bash
omp plugin config list omp-developer-cost-status
```

Set a custom salary:

```bash
omp plugin config set omp-developer-cost-status annualSalary 95000
```

Set custom working time assumptions:

```bash
omp plugin config set omp-developer-cost-status hoursPerWeek 37.5
omp plugin config set omp-developer-cost-status weeksPerYear 48
```

Optional settings:

```bash
omp plugin config set omp-developer-cost-status activeWindowMinutes 5
omp plugin config set omp-developer-cost-status currencyCode CAD
omp plugin config set omp-developer-cost-status label dev
```

The extension also accepts the legacy `annualSalaryUsd` field if older persisted data or tests still use it.

## Status command

The plugin registers a slash command for checking the current meter:

```text
/developer-cost-status
```

## Development

```bash
npm install
npm test
npm run build
```
