# omp-developer-attention-status Agent Guidance

## Code Style

- Prefer named intermediate variables over inline parsing, coercion, or defaulting inside returned object literals.
- Default raw input values before parsing, parse into named values, then return those names.
- Keep parser functions pure; do not mutate caller-provided options while applying defaults.
- Keep a parser beside its owning domain unless it is reused across domains; shared parser helpers belong in one-function files under `src/utils/`.

## Organization

- Group code by cohesive domain first, then by a concrete responsibility when a domain grows.
- Keep public entrypoints thin; keep infrastructure adapters separate from domain state and operations.
- Avoid singleton folders and one-function files unless they clarify a reusable boundary.
