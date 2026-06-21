---
name: mcp-vertex-legacy-proposal-migration
appliesTo: ['@mcp-vertex/proposals']
description: The strict 3-script + 1-tool order for migrating pre-f00016 legacy proposals (pNNN-*.md) onto the current state machine, the legacy-status mapping table, and why the lint treats `l`-prefixed files as a permanent warning instead of an error. Use only when migrating historical pNNN proposals — never for ordinary day-to-day proposal work.
---

# mcp-vertex legacy proposal migration

## Decision tree

1. Found a `pNNN-*.md` file directly under `docs/proposals/` (not yet
   migrated)? -> this skill applies; otherwise (ordinary proposal work) it
   does not.
2. Dry-run first, always: run each script with NO flags before `--apply` —
   every script defaults to dry-run and prints its plan.
3. Run the 3 scripts in this exact order, `--apply` only after reviewing
   each dry-run: `migrate-legacy.script.ts` -> `rewrite-refs.script.ts` ->
   `normalize-legacy.script.ts`.
4. Last step is a TOOL, not a script: `proposals_sync_proposals` (MCP), to
   rebuild `index.json` from the now-migrated files.
5. Linter still warns about the migrated files afterwards? -> expected —
   `l`-prefixed files are warn-only permanently, not a transient migration
   artifact to "fix away".

## The 3 scripts, in strict order

```
bun tools/scripts/proposals/migrate-legacy.script.ts            # dry-run
bun tools/scripts/proposals/migrate-legacy.script.ts --apply     # git mv pNNN -> lNNN + patch frontmatter

bun tools/scripts/proposals/rewrite-refs.script.ts                # dry-run
bun tools/scripts/proposals/rewrite-refs.script.ts --apply        # rewrite pNNN mentions -> lNNN across .md/.ts/.astro/.json

bun tools/scripts/proposals/normalize-legacy.script.ts            # dry-run
bun tools/scripts/proposals/normalize-legacy.script.ts --apply    # backfill kind/track/date/title on lNNN frontmatter
```

Then, as an MCP tool call (NOT a script): `proposals_sync_proposals` to
rebuild `docs/proposals/index.json` from the migrated files.

Order matters because `rewrite-refs.script.ts` imports `planMigration` from
`migrate-legacy.script.ts` to know which `pNNN -> lNNN` renames are real (so
it never touches a coincidental `p\d+-` substring that isn't an actual
migrated id) — it must run against the SAME proposal set `migrate-legacy`
already renamed on disk, and `normalize-legacy.script.ts` only walks files
already named `lNNN-*.md`.

## What each script does

- **`migrate-legacy.script.ts`**: renames `pNNN-<slug>.md` to
  `lNNN-<slug>.md` (slug kept verbatim, never stripped), `git mv`s it into
  the folder its mapped status implies, and patches the minimal frontmatter
  (`id`, `status`, `kind: legacy`, `title` if absent). Body content and
  section structure are NOT touched.
- **`rewrite-refs.script.ts`**: greps the whole repo (`.md`/`.ts`/`.astro`/
  `.json`, skipping `index.json` since `sync_proposals` regenerates it) for
  literal `pNNN-<slug>` and bare `\bpNNN\b` mentions and rewrites them to the
  new `lNNN` form — only for ids `migrate-legacy.script.ts` actually has a
  plan for.
- **`normalize-legacy.script.ts`**: walks every `lNNN-*.md` and backfills
  `kind: legacy`, `track: legacy`, a default `date`, and a derived `title`
  if any are missing — never rewrites body prose into a modern scaffold.

## Legacy 8-status -> new 7-status mapping

From `STATUS_MAP` in `tools/scripts/proposals/migrate-legacy.script.ts`:

| Legacy status | New status | Extra frontmatter |
|---|---|---|
| `done` | `done` | — |
| `retired` | `retired` | — |
| `paused` | `paused` | — |
| `blocked` | `blocked` | — |
| `deferred` | `paused` | `deferred: true` (deferred is not its own status — it's paused + a flag) |
| `pending` | `blocked` | `blocked_by: [self:needs-triage]` ("pending" meant "not yet triaged") |
| `in_progress` | `in-progress` | — (respelled, same meaning) |
| `ready` | `ready` | — |
| *(anything unrecognised)* | `blocked` | `blocked_by: [self:needs-triage]` (same fallback as `pending`) |

## Why `l` stays a permanent warning, not an error

`tools/scripts/lint/proposals.script.ts` treats any `[pl]\d{5}-` filename
(or anything under `done/`) as legacy and downgrades scaffold violations to
warnings, **permanently** — not just during the migration window. Legacy
docs are historical, mostly `done`, and predate the Goal/Why/Non-goals/
Slices/Acceptance scaffold; some have no 1:1 mapping at all (a decision doc
with no Slices section, by design), and their slice sub-format predates the
`### S<N> —` heading shape entirely. Forcing 100% conformance would mean
either rewriting meaning into documents that shouldn't change, or never
finishing — `kind: legacy` (the `l` prefix) is the signal "imported,
evaluated leniently", at the same tier as the pre-migration `p` prefix, not
a stricter one.

## Never do

- Never run `rewrite-refs.script.ts` before `migrate-legacy.script.ts --apply`
  has actually moved the files — its rewrite plan is derived from
  `planMigration`'s output, which assumes the rename already happened (or is
  about to, in dry-run preview mode only).
- Never hand-edit `docs/proposals/index.json` after migrating — always
  finish with `proposals_sync_proposals` (the tool, not a script).
- Never try to "fix" the `l`-prefix lint warning by rewriting a legacy
  proposal's body into the modern scaffold — that's explicitly out of scope
  for `normalize-legacy.script.ts` and would lose historical meaning.
- Never skip the dry-run — every script's default behaviour (no flags) is
  read-only; always read the printed plan before adding `--apply`.

## Smoke

```
bun tools/scripts/proposals/migrate-legacy.script.ts
```
With zero `pNNN-*.md` files left under `docs/proposals/` (already migrated
repo), prints `0 proposal(s) planned.` and exits 0 — confirms the script is
idempotent and safe to re-run as a no-op check.
