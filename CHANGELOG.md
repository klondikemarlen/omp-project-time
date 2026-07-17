# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
## [4.0.0] - 2026-07-17

### Added

- Record immutable, repository-attributed `human_active` and separate `agent_turn_elapsed` intervals for top-level OMP sessions.
- Add local raw, independent, equal-split, and explicit weighted allocation reports for concurrent work.

### Changed

- Make human-active intervals the default Project Time report source and expose the OMP-active union as a non-desk-time reference.

### Removed

- Remove developer-cost, hourly-rate, billable-policy, client, and external-timesheet behavior.

## [3.4.0] - 2026-07-16

### Added

- Add provider-neutral `/project-time timesheet preview` entries from repository-mapped active time.

### Changed

- Configure repository timesheets with project and billing-category mappings; generated session tasks stay local.


## [3.3.1] - 2026-07-16

### Changed

- Require OMP 17.0.1 or newer so Project Time status remains visible alongside other keyed extension statuses.

## [3.3.0] - 2026-07-16

### Added

- Add `/project-time settings` with local effective paid hourly cost, billable-policy state, and configured rates.

### Fixed

- Load existing shared developer-meter entries after the settings rename.

### Changed

- Rename cost settings around annual gross salary and expected working time; legacy setting values continue to load.
- Replace the default billable-policy `{}` with an explicit `disabled` state and a named structured policy setting.


## [3.2.0] - 2026-07-16

### Added

- Add configurable locale formatting for developer and billable CAD amounts.


## [3.1.0] - 2026-07-16

### Changed

- Keep persisted Project Time values scalar and use a generic tracking-data marker.


## [3.0.0] - 2026-07-16

### Changed

- Present developer and billable costs in CAD while keeping persisted tracking components currency-neutral.
- Reset existing local Project Time tracking data once before recording CAD-only data.

### Removed

- Remove per-client billable currency configuration and persisted currency fields.


## [2.3.2] - 2026-07-15

### Changed

- Share Git repository identity infrastructure between billable-time and automatic project-time logging.

## [2.3.1] - 2026-07-14

### Fixed

- Fall back to `Unlabeled billable work` instead of dynamically loading an unavailable OMP title module.

## [2.3.0] - 2026-07-14

### Added

- Show current-project developer time and billable record history through `/project-time history`.

## [2.2.0] - 2026-07-14

### Added

- Snapshot configured provider-neutral category IDs and labels on billable project records, summaries,
  and previews.

## [2.1.1] - 2026-07-14

### Fixed

- Make `/project-time` visibly report the current project, meter, billable-policy state, and
  available commands instead of relying on a subtle hook-status update.

## [2.1.0] - 2026-07-14

### Added

- Let an opted-in billable client policy target the active Git repository by default, with
  provider-neutral project-name overrides and project facts in local previews.

### Fixed

- Offer documented `/project-time` arguments in OMP and report unsupported arguments clearly.

## [2.0.0] - 2026-07-14

### Changed

- Rename the package, command, settings, status state, local storage, repository, and published spec to Project Time.
- Migrate local billable, time-log, and shared spread-billing data once; stop on destination conflicts instead of merging records.

## [1.2.1] - 2026-07-14

### Fixed

- Generate billable descriptions from the active session branch, excluding abandoned branch context.

## [1.2.0] - 2026-07-14

### Added

- Add private session-description records and a provider-neutral billable preview; no external-system adapter or payload is defined.

## [1.1.0] - 2026-07-14

### Added

- Record separate, client-attributed five-minute attention tokens and exact AI intervals in local billable ledgers.
- Add billable summaries with independent rate and currency snapshots.

### Changed

- Validate ISO 4217 currencies, preserve complete records after interrupted appends, and round billable amounts only for display.

## [1.0.6] - 2026-07-13

### Fixed

- Keep shared billing and repository time-log writes within OMP's handler deadline during cross-window lock contention.

## [1.0.5] - 2026-07-12

### Changed

- Normalize meaningful standalone operations to support matching named and default imports.
- Replace the local inline-status proposal with [OMP issue #1966](https://github.com/can1357/oh-my-pi/issues/1966).

### Fixed

- Describe bundled third-party runtime dependencies at their actual `dist/vendor/` location.

## [1.0.4] - 2026-07-12

### Added

- Add privacy-first background Git repository time tracking with automatic interval and 5/10/15-minute summary artifacts.

### Changed

- Organize automatic repository attention tracking into a focused time-log domain and ship readable ESM modules.
- Format generated JavaScript and separate emitted class members for human-readable package inspection.
- Consolidate one-use billing timing wrappers into their owning operations and runtime.
- Use `@/` source imports while rewriting the published ESM module graph to runtime-safe relative specifiers.

### Fixed

- Bundle the lockfile library and its transitive dependencies for OMP plugin installation.

## [1.0.3] - 2026-07-10

### Fixed

- Bundle plugin runtime dependencies so OMP validates remote GitHub installs without CJS resolution errors.
- Ship required third-party notices and verify the tracked bundle remains current in Continuous Integration.

## [1.0.2] - 2026-07-10

### Added

- Add persisted developer attention metrics and a detailed project-time summary.
- Divide overlapping top-level session cost across the active sessions.

### Changed

- Establish the previous package and repository identity.

### Fixed

- Install lock runtime dependencies when OMP resolves the plugin remotely.

## [1.0.1] - 2026-07-03

### Added

- Add lightweight PR and feature issue templates plus local development workflow docs.

### Fixed

- Make Continuous Integration run the test suite on the pinned Node.js runtime.

## [1.0.0] - 2026-06-29

### Changed

- Mark the canonical developer-cost status contract as stable for v1.
- Keep multi-session spread billing as a planned post-v1 enhancement.

### Added

- Add hook-boundary feature coverage for visible developer-cost accrual across prompts and idle time.
- Guard package metadata so release artifacts keep shipping the canonical feature spec.

## [0.8.0] - 2026-06-26

### Changed

- Scope the 0.8 preview spec to prompt-driven, single-session developer cost tracking.
- Treat multi-session spread billing as a planned later enhancement.

### Fixed

- Replace filesystem-based child-session detection with OMP session header metadata.
- Surface malformed or unreadable plugin config files instead of silently falling back to defaults.
- Restore persisted developer cost from the full session history so branch changes do not hide prior meter state.

### Added

- Package the canonical feature spec with release artifacts.
- Document the supported Node.js and OMP runtime contract.
- Add CI coverage for tests, typecheck, and package contents.

## [0.7.0] - 2026-06-25

### Added

- Add prompt-driven developer-time cost tracking for OMP sessions.
- Add configurable salary, working-hours, active-window, refresh-interval, and label settings.
- Persist precise decimal cost state in session custom entries.
- Add tests for billing math, persisted state parsing, and config reload behavior.
