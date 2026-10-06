# Project Time Knowledge Base

Project Time records local, verifiable OMP work evidence. This knowledge base gives maintainers a durable starting point without duplicating source-local implementation detail or generic development procedures.

## Start Here

- [Evidence domain](domain/evidence.md) — recorded concepts, invariants, privacy boundary, and what evidence does not mean.
- [Product surface and boundaries](product/surface-and-boundaries.md) — commands, settings, local views, and downstream billing boundary.
- [Evidence architecture](architecture/evidence-pipeline.md) — runtime, domain, storage, and export ownership.
- [Billing boundary decision](decisions/keep-billing-downstream.md) — why Project Time preserves evidence rather than allocating or submitting time.
- [Evidence QA scenarios](qa-scenarios/evidence-contract.md) — repeatable checks that protect the public evidence contract.

## Authority

| Subject                                  | Authoritative source                                                                | Use it for                                     |
| ---------------------------------------- | ----------------------------------------------------------------------------------- | ---------------------------------------------- |
| Intended product behavior and exclusions | [`spec/project-time.yml`](../spec/project-time.yml) and [`README.md`](../README.md) | Product meaning and public contract            |
| Current implementation behavior          | [`src/`](../src/)                                                                   | Runtime, persistence, and adapter details      |
| Observed regression evidence             | [`test/`](../test/)                                                                 | Supported scenarios and executable assertions  |
| Package and release metadata             | [`package.json`](../package.json) and [`CHANGELOG.md`](../CHANGELOG.md)             | Version, scripts, and published change history |

When these sources conflict, record the conflict rather than silently reconciling it here. The specification and README define intended product meaning; code describes the current implementation; tests demonstrate observed behavior.

## Publication Boundary

These Markdown files are repository-local documentation. The repository's visibility controls access; no documentation site, generated documentation artifact, or public-content allowlist is established by this change. Do not commit credentials, raw prompts, local paths, customer billing details, or other confidential material.
