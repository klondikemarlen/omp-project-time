# omp-developer-cost-status Agent Guidance

## Code Style

- Prefer named intermediate variables over inline parsing, coercion, or defaulting inside returned object literals.
- Parse and default input fields before `return`, then return the named values.
- Keep parser functions pure; do not mutate caller-provided options while applying defaults.
