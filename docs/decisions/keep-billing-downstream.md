# Keep Billing Decisions Downstream

- **Status:** Accepted
- **Date:** 2026-10-06

## Context

OMP can observe activity for concurrent repositories. Project Time therefore records full independent intervals for each repository. Summing those observations can exceed elapsed wall-clock time, and neither source represents a billing decision by itself.

The retired repository-billing configuration mixed evidence collection with repository-to-project and task attribution. That made a local evidence plugin responsible for external billing policy and risked presenting prompt or concurrent activity as automatically billable.

## Decision

Project Time owns only raw local evidence and a versioned export. It does not map local projects to external billing destinations, aggregate evidence sources, allocate overlapping intervals, calculate money, or write external entries.

A downstream worklog tool owns destination mapping, review, allocation, and any explicit external submission. It must make allocation visible for review instead of treating Project Time duration as a billable claim.

## Consequences

- Concurrent project evidence remains complete and provider-neutral.
- A downstream tool can adopt a billing provider without adding credentials or provider policy to Project Time.
- Users need a separate reviewed workflow to turn evidence into billable entries.
- Project Time does not offer local allocation totals or overlap diagnostics; downstream consumers may implement an explicit policy from the raw snapshot.

## Rejected Alternative

**Assign billing destinations while recording intervals.** Rejected because the same source evidence can require different billing policy over time, and automatic attribution would conflate observation with approval.

## Sources

- Normative exclusions: [`spec/project-time.yml`](../../spec/project-time.yml)
- Migration and downstream boundary: [`README.md`](../../README.md)
- Retired-setting validation: [`src/config/project-time-config.ts`](../../src/config/project-time-config.ts)
