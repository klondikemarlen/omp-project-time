# Retain TypeScript at the OMP Boundary

## Decision

Keep TypeScript source, published ESM JavaScript, OMP's Bun host, and Node-based development and CLI tooling. Keep SQLite as the local evidence store. A language change is an option when a measured constraint requires it, not a prerequisite for improving the implementation.

## Context

Project Time runs inside OMP, registers lifecycle hooks and commands, calls the host UI, and uses OMP's model-completion API. Its standalone CLI shares the same evidence domain and persistence implementation. The ledger selects `bun:sqlite` in OMP and `node:sqlite` in Node through one small adapter.

A rewrite of the evidence domain would still need a JavaScript host adapter. A separate process or native module would introduce a serialization or FFI boundary, another build/distribution path, and additional shutdown and error-handling responsibilities. It would not by itself fix disagreement between migration, autocomplete, and prune preview semantics.

## Alternatives

| Option                     | Fit for the current product                                                           | Additional responsibility                                                              | Decision                       |
| -------------------------- | ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------ |
| TypeScript with ESM output | Shares typed domain rules across extension, CLI, and tests; runs in the existing host | Maintain Node/Bun SQLite parity and compiled package imports                           | Retain                         |
| Rust or Go core            | Could serve a demonstrated CPU, memory, or standalone-binary requirement              | Host bridge, cross-runtime contracts, native/process packaging, and lifecycle handling | No evidenced requirement today |
| Python core                | Could serve a Python-specific integration                                             | Interpreter distribution, host bridge, and duplicated runtime contracts                | No evidenced requirement today |

## Revisit Conditions

Measure a concrete consumer problem first: realistic retained-ledger read latency or memory, event-handler deadline failures, a required unsupported host capability, or a standalone distribution constraint. Compare a targeted query/algorithm change against a language prototype using the same evidence and lifecycle scenarios. Do not claim a rewrite improves performance without that comparison.

The current full-ledger reads used by reports remain a scaling hypothesis, not a measured regression. SQLite already updates automatic entries by stable ID without rewriting the complete ledger.

## Verification Boundary

Node tests and typechecking do not prove the Bun host loads the installed artifact. Release verification must also exercise the built CLI with an isolated home directory, run persistence behavior under Bun, reinstall the released plugin, and check command behavior and autocomplete in a fresh OMP process. Existing OMP processes retain loaded extension modules.

## Sources

- Host and CLI contracts: [/README.md](/README.md)
- Runtime selection and persistence: [/src/time-log/infrastructure/ledger.ts](/src/time-log/infrastructure/ledger.ts)
- Build, dependencies, and engine requirement: [/package.json](/package.json)
- Runtime ownership: [/docs/architecture/evidence-pipeline.md](/docs/architecture/evidence-pipeline.md)
