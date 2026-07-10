# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Add privacy-first background Git repository time tracking with automatic interval and 5/10/15-minute summary artifacts.

### Changed

- Organize automatic repository attention tracking into a focused time-log domain and ship readable ESM modules.

## [1.0.3] - 2026-07-10

### Fixed

- Bundle plugin runtime dependencies so OMP validates remote GitHub installs without CJS resolution errors.
- Ship required third-party notices and verify the tracked bundle remains current in Continuous Integration.

## [1.0.2] - 2026-07-10

### Added

- Add persisted developer attention metrics and `/developer-cost-status summary`.
- Divide overlapping top-level session cost across the active sessions.

### Changed

- Rename the package and repository to `omp-developer-attention-status`.

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
