# Committing

## Format

`:emoji: Verb phrase.` — imperative mood, subject line ends with a period.

**Subject line describes the outcome or "why", not what was added.** The diff already shows what changed — the subject should tell the reader why it matters or what the user-visible effect is.

- ❌ `:sparkles: Add document card for admin view.` — describes what was built
- ✅ `:sparkles: Show documents with download actions on admin card.` — describes the outcome

When using broad verbs like "align", "nest", "scope", or "move", name the concrete namespace,
target, and comparison point in the subject so the outcome is clear without branch or PR context.

- ❌ `:construction: Nest document routes.` — does not say where they are nested
- ✅ `:construction: Nest document routes under the account namespace to match report routing.` — names the target namespace and comparison point
- ❌ `:recycle: Align web routes.` — does not say what they align with
- ✅ `:recycle: Align document web routes with account routes.` — names the comparison point

**Simple commits:** Single line when the change is self-explanatory.
**Complex commits:** Title line followed by one or two plain sentences explaining the non-obvious context — things the diff doesn't make immediately clear. Each sentence ends with a period.

## When to use bullet points

Use bullet points for:

- Multi-part changes with distinct items
- Complex changes needing detailed explanation
- When multiple files or concepts are affected

Example:

```
:recycle: Rename and reorganize user management components.

- Rename UsersController to UsersTableController
- Move user group logic to separate controller
- Update all route references
```

## When NOT to use bullet points

For simple single-purpose changes, use a second line instead for "why" explanation (conversational, not bullet list):

- Adding one migration file
- Straightforward single-file changes
- When title is self-explanatory

Example:

```
:butterfly: Add backfill migration for attachment association name rename.

Prepares for renaming receiptStatus to signedReceiptStatus in the document model.
```

## Emoji guidance

- `:sparkles:` — new features
- `:bug:` / `:beetle:` — bug fixes
- `:lock:` — security restrictions, especially policy/access restrictions
- `:shield:` / `:japanese_castle:` / `:european_castle:` — guardrails, invariants, and edge-case prevention
- `:recycle:` — structural cleanup or migration-safe refactors that preserve behavior
- `:butterfly:` — database migrations and data backfills
- `:art:` — theme, styling, or visual changes
- `:cherry_blossom:` — UI polish and cosmetic improvements
- `:memo:` — documentation and plan updates
- `:wrench:` — config and settings changes
- `:hammer:` — infrastructure and tooling changes (docker, scripts)
- `:arrow_up:` — dependency, runtime, and version bumps
- `:arrow_down:` — dependency downgrades
- `:construction:` — intentionally incomplete migration slices that may leave the app broken between commits
- `:fire:` — deletion/removal of code or features
- `:unlock:` — security relaxations
- `:ok_hand:` — fixes/adjustments
- `:truck:` — renames/moves
- `:white_check_mark:` / `:heavy_check_mark:` — tests
- `:heavy_plus_sign:` — additions
- `:heavy_minus_sign:` — removals
- `:label:` — typing fixes

## Multi-concern commits

When a commit addresses more than one concern, put the primary concern in the subject line and move secondary concerns into the body. Each sentence in the body ends with a period.

Example:

```
:bug: Fix primary thing.

Also fix secondary thing.
```

## Commit body guidance

Write in plain English for the next developer reading `git log`. Use conversational style and focus on "why" and "what" rather than implementation mechanics.

**Common markers to structure information:**

- `Why?` - Explains the reason for the change
- `What?` - Explains what was changed or the problem being solved
- `How?` - Technical implementation details
- `NOTE:` - Additional context, warnings, or caveats
- `TODO:` - Future work that needs to be done
- `See` - References to issues, PRs, external links, or other commits
- `Undoes` - References to previous commits being reverted
- `Also` - Additional related changes

**Examples:**

```
Why? Simplify non-reusable queries into services to reduce complexity at caller location.

What? Previously if you modified the record name, then changed it back to the original value, it would show as invalid.

NOTE: if a database only supports one cascade path between tables, use a restrictive action for the secondary relationship.

See https://github.com/example-org/example-repo/issues/309
```

Focus on:

- What changed (briefly, since the diff shows the how)
- Why it was needed — the problem being solved
- What the observable effect is for users or callers
- Prefer active phrasing in the body when it clarifies the outcome, especially for infrastructure
  and tooling changes
- When a body mentions a failure or mismatch, name the concrete issue you actually observed when
  possible (for example a specific runtime version mismatch) instead of describing it only in
  generic terms

Avoid: in-progress reasoning, implementation mechanics, and code symbols in prose.

## Rewording past commits

The global git editor is `devin-desktop --wait`, which hangs when invoked non-interactively. Use these patterns instead.

**Reword HEAD:**

```bash
git commit --amend -m "new message"
```

**Reword an older commit:**

```bash
# 1. Detach HEAD at the target commit
git checkout <hash>
# 2. Amend directly (-m bypasses the editor)
git commit --amend -m "new message"
# 3. Rebase the branch tip back on top
git rebase --onto HEAD <branch-tip>~ <branch-tip>
# 4. Move the branch pointer back
git branch -f <branch> HEAD && git checkout <branch>
```

**Interactive rebase without editor hang:**

```bash
GIT_EDITOR="true" git rebase -i <base>
```

`GIT_EDITOR="true"` makes git use the `true` no-op command for commit message editing, so the sequence editor step works normally but individual message editing is skipped. Combine with `--amend -m` for rewording specific commits mid-rebase.

NOTE: Multi-line `--exec` strings in `git rebase --onto` are not supported.

---

## General rules

- **One commit per logical change** — don't bundle multiple fixes or changes into a single commit
- Never `git push --force` on main branch
- Use `Part of <issue-url>` in PR bodies for multi-PR work. Reserve `Fixes <issue-url>` for the PR that should actually close the issue.
