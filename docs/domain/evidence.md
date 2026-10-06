# Evidence Domain

## Purpose

Project Time records local OMP activity as reviewable evidence of project work. It does not claim desk time, billable time, cost, or an allocation between projects.

## Core Concepts

| Concept                  | Meaning                                                                      | Invariant                                                                            |
| ------------------------ | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Automatic evidence entry | A recorded interval for a top-level OMP session                              | Has a stable ID, source kind, project/repository identity, bounds, and creation time |
| `human_active`           | Prompt-driven collaboration window                                           | Useful context; never an automatic billable-hours claim                              |
| `agent_turn_elapsed`     | Elapsed time from the start to end of a top-level agent turn                 | Separate from human activity and never automatically added to it                     |
| Project                  | Sanitized local project label derived from the repository                    | Exact labels may be selected in local views and exports                              |
| Repository identity      | One-way repository hash plus optional normalized `host/path` remote identity | No raw URL, credential, local path, or working directory is stored                   |
| Activity and narrative   | Coarse activity label and optional detailed work description                 | Narrative is review evidence, not billing attribution                                |
| Work item attribution    | Provenance of an optional issue or pull request                              | `explicit_prompt`, `carried_forward`, `unassigned`, and `ambiguous` prevent guessing |

## Evidence Rules

- Only top-level OMP sessions create entries. Subagents and artifacts belong to their parent session and must not create their own evidence.
- A work-item attribution transition ends the prior interval segment rather than extending it across a changed context.
- Concurrent repositories retain their full independent intervals. Their totals may exceed elapsed wall-clock time; that is evidence, not an error or an allocation decision.
- The public snapshot is `omp-project-time/evidence` version 1 and contains raw entries. SQLite is an internal storage detail.
- Malformed persisted input is rejected rather than treated as absent.

## Retention

Evidence remains in the local ledger until an explicit CLI prune. `project-time prune --before YYYY-MM-DD` deletes entries that ended at or before the specified local-day boundary; it preserves an interval that crosses that boundary rather than rewriting it. A dry run reports the impact without deleting evidence. Pruning does not allocate, aggregate, or relabel either source and has no archive or undo path.

`stats` reports the exact combined byte count of managed local evidence files—the SQLite ledger, present journal/WAL/SHM sidecars, and retained legacy JSON backup. This global storage footprint is inspection evidence only; it is not attributed to a selected project and does not change retention.

## Privacy Boundary

Persisted entries may contain sanitized project identity, repository identity, timing, source kind, session identity, coarse activity, optional narrative, and optional work-item provenance. They must not contain working-directory paths, raw remotes, credentials, prompts, transcripts, artifacts, file paths, model metadata, or custom billing attribution.

## Downstream Use

A downstream worklog tool may review this evidence and make a human-approved allocation decision. Project Time itself does not map repositories to billing targets, combine sources, calculate money, or write external time entries.

## Sources

- Intended rules: [`spec/project-time.yml`](../../spec/project-time.yml)
- Entry model and parsing: [`src/time-log/domain/`](../../src/time-log/domain/)
- Persistence implementation: [`src/time-log/infrastructure/ledger.ts`](../../src/time-log/infrastructure/ledger.ts)
- Executable evidence: [`test/time-log.test.ts`](../../test/time-log.test.ts)
