# omp-developer-attention-status Agent Guidance

## Code Style

- Prefer named intermediate variables over inline parsing, coercion, or defaulting inside returned object literals.
- Default raw input values before parsing, parse into named values, then return those names.
- Keep parser functions pure; do not mutate caller-provided options while applying defaults.
- Put reusable parser helpers in one-function files under `src/utils/`, following the WRAP utils pattern.
