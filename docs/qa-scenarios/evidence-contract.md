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

### Recovery Previews Before Import

**Given** an import failure that left an empty SQLite schema, **when** the legacy JSON is repaired, **then** project autocomplete includes its projects and prune dry-run counts its completed entries while retaining crossing intervals. Neither preview changes the SQLite or legacy JSON bytes. Invalid pending input or a conflict with already recorded SQLite entries must make dry-run fail rather than report zero matches.

**Given** a completed import followed by pruning, **when** either preview runs again, **then** it uses the remaining SQLite evidence and never resurrects the retained backup.

- Automated evidence: [/test/ledger-migration-views.test.ts](/test/ledger-migration-views.test.ts)
- Focused command: `node --import tsx --test test/ledger-migration-views.test.ts`
- CLI smoke: use a throwaway `HOME`, create malformed `time-log.json`, run the built `project-time entries` and observe the error, repair the JSON, then compare `project-time prune --before DATE --dry-run` with the real prune. Only the real command may delete matching entries. Never run destructive QA against the user's evidence.

## Retired Billing Configuration

**Given** a plugin config containing retired repository-billing settings, **when** configuration loads, **then** it fails explicitly rather than silently accepting stale attribution policy.

- Automated evidence: [`test/config.test.ts`](../../test/config.test.ts)
- Focused command: `node --import tsx --test --test-name-pattern='retired repository billing setting' test/*.test.ts`

## Baseline Automation

Run `npm test` for repository-wide regression coverage. The package's test script runs TypeScript tests through Node and `tsx`; it is the documented automated check for this repository.

For persistence or runtime changes, also run `npm run build`, import `dist/index.js` in Node, and run `npm pack --dry-run`. Exercise the SQLite path in Bun separately: Node's test suite only covers `node:sqlite`. After installing the released GitHub artifact, verify its package version, launch a fresh OMP process, check `/project-time` command autocomplete and behavior, then close that process. If the package binary is not on the shell's `PATH`, invoke its `dist/project-time-cli.js` with Node directly rather than treating that as an extension-load failure.
