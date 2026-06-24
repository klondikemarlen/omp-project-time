# omp-developer-cost-status

OpenCode/OMP TUI plugin that adds developer time cost to the session status line.

## Intent

**WHY this plugin exists:** Agent cost shows model spend. It does not show what the developer's own active time costs while driving the session.

**WHAT this plugin produces:** A session status-line segment like `$3.33 (dev)` that increments in 5-minute active windows.

**Decision Rules:**
- **Prompt-driven activity:** A session becomes active when the user sends a direct prompt into that session.
- **Five-minute extension:** Each prompt extends activity by 5 minutes by default.
- **Full windows only:** Cost is added only after a full active window elapses. Partial windows do not bill.
- **No subagent billing:** Subagent sessions are ignored. Only the user-driven parent session is tracked.
- **Public-safe defaults:** The built-in defaults are generic Canadian full-stack developer values, not a personal salary.

## Status-line behavior

The plugin renders on the `session_prompt_right` TUI slot.

It matches the built-in subagent cost style as closely as the current plugin API allows:

- display format: `$4.76 (dev)`
- lowercase suffix in parentheses
- muted text styling

It does **not** render immediately after the built-in `... · $4.76 (sub)` text. OpenCode renders that built-in usage block inside the prompt component itself, while this plugin renders in the prompt row's separate right-aligned plugin slot.

Billing is tracked per parent session id. If you later resume the same session id, the plugin reloads that saved total and keeps adding to it. Starting a new session id starts a new meter.

## Defaults

The plugin now works out of the box with generic Canadian defaults:

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

This plugin uses OpenCode's `plugin` config, not the legacy single-file `omp plugin install` flow used by older `omp.extensions` packages.

For this private repository, the simplest install is a local checkout.

```bash
git clone git@github.com:klondikemarlen/omp-developer-cost-status.git
cd omp-developer-cost-status
npm install
```

Then add the plugin directory to `~/.config/opencode/opencode.json` or your project `opencode.json`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": [
    "/absolute/path/to/omp-developer-cost-status"
  ]
}
```

Restart OMP/OpenCode after changing plugin config.

### Override the defaults

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": [
    [
      "/absolute/path/to/omp-developer-cost-status",
      {
        "annualSalary": 95000,
        "hoursPerWeek": 37.5,
        "weeksPerYear": 48,
        "activeWindowMinutes": 5,
        "currencyCode": "CAD",
        "label": "dev"
      }
    ]
  ]
}
```

## How plugin installation works

OpenCode supports two plugin loading paths:

1. Local plugin directories or files
2. NPM package specs in `opencode.json`

NPM plugins are installed automatically at startup. This repo is private and not published to npm, so the recommended path is a local checkout referenced from `opencode.json`.

## Configuration

All options are optional.

Primary options:

- `annualSalary` — defaults to `80000`
- `hoursPerWeek` — defaults to `40`
- `weeksPerYear` — defaults to `50`

Other options:

- `activeWindowMinutes` — defaults to `5`
- `currencyCode` — defaults to `CAD`
- `label` — defaults to `dev`

Backward compatibility:

- `annualSalaryUsd` is still accepted as a legacy alias for `annualSalary`

If a provided numeric value is non-positive, that field falls back to its default.

## Development

Runtime loading uses the source `src/tui.tsx` entrypoint directly. `npm run build` is a typecheck, not a bundling step.

```bash
npm install
npm test
npm run build
```
