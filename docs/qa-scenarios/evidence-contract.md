# Evidence Contract QA Scenarios

These scenarios protect the public evidence contract. They are behavior checks, not a replacement for the full test suite.

## Direct Evidence Export

**Given** a local ledger with a human-active entry, including a long narrative, **when** `project-time entries --project NAME` runs, **then** stdout is valid `omp-project-time/evidence` version 1 JSON containing the complete matching entry without interactive truncation.

- Automated evidence: [`test/project-time-cli.test.ts`](../../test/project-time-cli.test.ts)
- Smoke command: `project-time entries --project NAME | jq '{ format, version, entryCount: (.entries | length) }'`

## Statistics and Explicit Pruning

**Given** raw evidence from multiple source kinds and projects, **when** `project-time stats [--project NAME]` runs, **then** it emits a versioned summary with overall and per-project entry counts, separate observed durations, retained time bounds, and exact global `localStorageBytes`. The count includes the SQLite ledger, present journal/WAL/SHM sidecars, and retained legacy JSON backup; `--project NAME` filters evidence but does not attribute storage. The interactive `/project-time stats` view shows the selected scope and a compact storage size without treating either durations or bytes as billable.

**Given** entries ending before, at, and across a local-day boundary, **when** `project-time prune --before YYYY-MM-DD --dry-run` runs, **then** it reports only entries ending at or before that boundary and leaves the ledger's evidence intact. **When** the same command omits `--dry-run`, **then** it deletes those entries and retains crossing intervals.

- Automated evidence: [`test/project-time-cli.test.ts`](../../test/project-time-cli.test.ts), [`test/runtime.test.ts`](../../test/runtime.test.ts)
- Smoke commands:

  ```bash
  project-time stats | jq '{ format, version, entryCount, sources, localStorageBytes }'
  project-time prune --before 2026-01-01 --dry-run
  ```

## Interactive Read-Only Preview

**Given** entries from more than one local project, source kind, and date, **when** `/project-time entries DATE --project NAME` runs, **then** the widget contains only the selected clipped intervals, reports human and agent duration separately, hides excess rows within its bound, and directs the user to the complete CLI JSON export.

- Automated evidence: [`test/runtime.test.ts`](../../test/runtime.test.ts)
- Manual OMP check: open `/project-time entries today --project NAME`; verify the displayed project, separate source totals, and read-only bounded view.

## Concurrent Evidence

**Given** overlapping top-level repository intervals, **when** entries are recorded and exported, **then** every raw interval is retained. Do not expect a union, allocation, billable total, or automatic source aggregation.

- Product authority: [`spec/project-time.yml`](../../spec/project-time.yml)
- Domain and persistence evidence: [`test/time-log.test.ts`](../../test/time-log.test.ts)

## Safe Persistence Migration

**Given** a valid legacy JSON ledger, **when** the SQLite ledger is first accessed, **then** supported automatic entries import transactionally and the JSON file remains unchanged. **Given** malformed legacy JSON, **then** import fails without a partial database write.

- Automated evidence: [`test/time-log.test.ts`](../../test/time-log.test.ts)
- Focused command: `node --import tsx --test --test-name-pattern='migrates automatic evidence|does not partially import invalid legacy JSON' test/*.test.ts`

## Retired Billing Configuration

**Given** a plugin config containing retired repository-billing settings, **when** configuration loads, **then** it fails explicitly rather than silently accepting stale attribution policy.

- Automated evidence: [`test/config.test.ts`](../../test/config.test.ts)
- Focused command: `node --import tsx --test --test-name-pattern='retired repository billing setting' test/*.test.ts`

## Baseline Automation

Run `npm test` for repository-wide regression coverage. The package's test script runs TypeScript tests through Node and `tsx`; it is the documented automated check for this repository.
