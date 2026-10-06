# Product Surface and Boundaries

## User Outcome

An OMP user can see the current local Project Time state and export complete raw evidence without sending time, credentials, or billing decisions to an external service.

## Public Surface

| Surface                 | Behavior                                                                                                                                                                  |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| OMP status              | A keyed, dim hook-status line shows the active local interval and configured label. OMP owns placement and layout.                                                        |
| `/project-time`         | Shows current top-level session state; `--project NAME` selects a persisted local project dashboard.                                                                      |
| `/project-time entries` | Opens a bounded, read-only local-date preview. It supports `today`, `yesterday`, one `YYYY-MM-DD` date, or an inclusive date range followed by an exact `--project NAME`. |
| `project-time entries`  | Writes the complete, unfiltered versioned JSON snapshot to standard output. Its only selector is `--project NAME`.                                                        |
| Settings                | `Active Window Minutes`, `Refresh Interval Seconds`, and `Status Label` are the only supported plugin settings.                                                           |

The interactive preview clips cross-midnight intervals to its selected local dates and shows human and agent totals separately. The direct binary intentionally exports the complete persisted snapshot instead of applying interactive date filtering.

## Product Boundaries

### Local evidence, not a clock

Project Time records prompt-driven collaboration and agent-turn elapsed intervals. It does not infer literal desk time, idle-terminal time, or manual timer activity.

### Separate sources, not an aggregate

`human_active` and `agent_turn_elapsed` are distinct observations. Neither source is added to the other or automatically called billable.

### Evidence, not billing

Project Time has no repository-to-client mapping, task mapping, rate, invoice, allocation, or external write capability. Billing mapping and review-only draft creation belong to Harvest Worklog. A user must still review any downstream allocation, especially when concurrent evidence overlaps.

### Local data, not remote session state

The selected dashboard and every export read the local ledger. They do not claim remote live state.

## Sources

- Product contract: [`README.md`](../../README.md)
- Normative requirements and non-requirements: [`spec/project-time.yml`](../../spec/project-time.yml)
- Interactive command implementation: [`src/extension/runtime.ts`](../../src/extension/runtime.ts)
- Direct export implementation: [`src/project-time-cli.ts`](../../src/project-time-cli.ts)
