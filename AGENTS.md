# omp-project-time Agent Guidance

## Code Style

- Favor declarative schemas and domain value objects at trust boundaries over repeated field-by-field parsing.
- Keep parsing pure and explicit; a parser may reject malformed configuration rather than silently treating it as absent.
- Use named intermediate values when they clarify a domain decision, not as mechanical copies of each serialized field.
- Let domain models own invariants and behavior; let mappers/repositories own serialization and storage details.
- Use a real ORM only when a relational persistence model needs querying, identity maps, or transactions. Append-only NDJSON needs a small repository/mapper, not an ORM dependency.
- Keep shared scalar parsers in `src/utils/`; keep domain-specific schemas and factories beside their domain.

## Organization

- Group code by cohesive domain first, then by concrete responsibility as that domain grows.
- Keep public entrypoints and event handlers thin. Separate domain models/use cases from infrastructure adapters such as files, locks, Git, and OMP.
- Prefer one meaningful domain module over a folder of trivial wrappers. Split files only at stable domain or adapter boundaries.
- Optimize for a maintainer reading one domain folder: names should reveal the business concept, and no file should require knowledge of unrelated infrastructure to understand its purpose.

## Persistence Changes

- Treat migration completion metadata, not SQLite file existence, as the import authority. Preserve parity between pending-import previews and actual operations; see [migration state and recovery](/docs/architecture/evidence-pipeline.md#migration-state-and-recovery).
- Run the [migration-preview regressions and host checks](/docs/qa-scenarios/evidence-contract.md#recovery-previews-before-import) when changing ledger reads or import behavior. Keep destructive smoke checks isolated from the user's evidence.

## Release Closeout

- After merging a release pull request, fetch `origin`, switch to the tracked default branch, and fast-forward it from `origin`.
- Delete only the merged agent-owned feature branch, run `git worktree prune`, and inspect `git worktree list`.
- Finish with a clean working tree on the latest `origin/main`; record the branch, sync, and retained worktree evidence.
