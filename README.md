# omp-developer-cost-status

OpenCode/OMP TUI plugin that adds developer time cost to the session status line.

## Intent

**WHY this plugin exists:** Agent cost shows model spend. It does not show what the developer's own active time costs while driving the session.

**WHAT this plugin produces:** A session status-line segment like `Dev $4.86` that increments in 5-minute active windows.

**Decision Rules:**
- **Prompt-driven activity:** A session becomes active when the user sends a direct prompt into that session.
- **Five-minute extension:** Each prompt extends activity by 5 minutes by default.
- **Full windows only:** Cost is added only after a full active window elapses. Partial windows do not bill.
- **No subagent billing:** Subagent sessions are ignored. Only the user-driven parent session is tracked.

## Status-line behavior

The plugin renders on the `session_prompt_right` TUI slot.

It tracks developer cost per session. The total resets on a new session and persists for the same session id if you reload plugins or restart the TUI.

Formula:

```text
windowRate = annualSalaryUsd / (hoursPerWeek × weeksPerYear × 60) × activeWindowMinutes
```

Example:

```text
annualSalaryUsd = 100000
hoursPerWeek = 35
weeksPerYear = 49
activeWindowMinutes = 5

windowRate = $4.86
```

## Install

Because this repository is private, the simplest install is a local checkout.

```bash
git clone git@github.com:klondikemarlen/omp-developer-cost-status.git
cd omp-developer-cost-status
npm install
```

Then add the plugin to `~/.config/opencode/opencode.json` or your project `opencode.json`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": [
    [
      "/absolute/path/to/omp-developer-cost-status",
      {
        "annualSalaryUsd": 100000,
        "hoursPerWeek": 35,
        "weeksPerYear": 49,
        "activeWindowMinutes": 5,
        "currencyCode": "USD",
        "label": "Dev"
      }
    ]
  ]
}
```

Restart OMP/OpenCode after changing plugin config.

## Configuration

Required:

- `annualSalaryUsd`
- `hoursPerWeek`
- `weeksPerYear`

Optional:

- `activeWindowMinutes` — defaults to `5`
- `currencyCode` — defaults to `USD`
- `label` — defaults to `Dev`

If required values are missing or non-positive, the plugin disables itself and shows a warning toast.

## Development

Runtime loading uses the source `src/tui.tsx` entrypoint directly. `npm run build` is a typecheck, not a bundling step.

```bash
npm install
npm test
npm run build
```
