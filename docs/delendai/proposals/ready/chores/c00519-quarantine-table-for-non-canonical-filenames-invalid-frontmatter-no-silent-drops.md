---
id: c00519
title: "Quarantine table for non-canonical filenames + invalid frontmatter (no silent drops)"
kind: feat
status: ready
type: proposal
track: state-engine
date: 2026-09-06
priority: P1
related:
    - c00510 # parent hardening round
    - c00514 # purity lint — quarantine writes are allowed only for the storage adapter
    - c00515 # fail-closed reasons — quarantine events flow into `state_store_stale`
    - q00018 # state-engine Phase 2 (rebuild) — quarantine is part of the reconciliation output
    - q00019 # state-engine Phase 1 (SQLite) — quarantine lives in the SQLite store
---

# c00519 — Quarantine table for non-canonical filenames + invalid frontmatter

## Goal

The reconciliador currently silently drops:

- **Non-canonical filenames** — the regex
  `/^[a-z]\d+[a-z]?-.+\.md$/iu` (sync-proposal-registry.ts:305)
  skips any `.md` whose name does not match.
- **Files without a YAML frontmatter block** —
  `if (block === null) continue` (sync-proposal-registry.ts:567).
- **Files with a legacy / invalid `status`** —
  `if (!isGlossaryStatus(status)) continue`
  (sync-proposal-registry.ts:571).
- **Files where the status is missing or invalid** — the parser
  defaults to `'pending'` (status, track, type, date all fall back
  to placeholder values).

The 2026-09-06 audit (B6 / B7) flagged these as P1: "dato presente
en Git + no reconocido = invisible para parte del state". The
post-commit review confirmed all four are still present in HEAD.

This proposal introduces a **quarantine table** that records every
file the reconciliador cannot promote, with the exact reason. The
table is exposed via `state_health` / `state_repair` so the
operator can recover or retire the offending files explicitly.

The proposal also removes the silent defaults in
`readProposalFile` (status → `pending`, track → `unspecified`, etc.).
Invalid metadata either matches the canonical schema or it does
not; there is no "invent a value to keep going" path.

## why

The user's invariant ("SQLite FAIL-CLOSED, no filesystem fallback")
has a direct corollary at the reconciliador level: a generation
cannot be published if its inputs include an unverified file. A
silent drop is the worst case (the file is in Git but invisible to
the state), so the alternative is to record the failure in
quarantine and let the operator decide.

## why this design

The quarantine is **not a separate store**. It is a table in the
SQLite store (q00019 S1). Phase 0 (this proposal) implements the
quarantine as a JSONL file under `.cache/delendai/proposals/quarantine.jsonl`,
so the reconciliador can be tested and the format proven before the
SQLite store lands.

The schema:

```
quarantine
  id              INTEGER PRIMARY KEY
  abs_path        TEXT NOT NULL
  blob_sha        TEXT NOT NULL
  source_commit_sha TEXT NOT NULL
  detected_at     INTEGER NOT NULL
  reason          TEXT NOT NULL  -- 'invalid_canonical_filename' | 'no_frontmatter' |
                                  -- 'invalid_status' | 'invalid_frontmatter_shape'
  detail          TEXT           -- human-readable, may include the offending substring
  raw_metadata    TEXT           -- JSON of whatever was parsable
```

Quarantined files are **not indexed** in the proposals registry,
**not visible** to `state_health` as proposals, and **not
procesable** by `proposal_transition`. They appear in `state_health`
under a separate `quarantine[]` array with the reason, abs_path,
and detected_at.

`state_repair` provides a `quarantine_resolve { id, action: 'adopt'
| 'retire' | 'quarantine_keep' }` operator command. `adopt`
re-promotes the file after the operator fixes the filename /
frontmatter; `retire` moves it to `legacy/`; `quarantine_keep`
leaves it but flags it as "intentionally not a proposal" (the
file stays in Git for history but the state acknowledges it).

## Tasks

### S1 — The quarantine table

`plugins/proposals/src/lib/proposals/quarantine.ts`:

- `IQuarantineEntry` interface (mirrors the schema above).
- `appendQuarantine(workspaceRoot, entry)` — append a new entry to
  `.cache/delendai/proposals/quarantine.jsonl` via `writeFileAtomic`
  + `withFileMutex`. The entry's `id` is `Date.now()` + a per-process
  counter (no need for SQLite auto-increment in Phase 0).
- `listQuarantine(workspaceRoot)` — read the JSONL file, parse
  each line, return the entries.
- `resolveQuarantine(workspaceRoot, id, action)` — remove the entry
  and (for `adopt` / `retire`) trigger the corresponding migration.

### S2 — Reconciliador integration

`plugins/proposals/src/lib/proposals/sync-proposal-registry.ts`:

- `scanSubtree` — for every `.md` whose filename does not match
  the canonical regex, call `appendQuarantine(...)` with
  `reason: 'invalid_canonical_filename'`. Continue scanning the
  rest of the directory.
- `scanNewSystemFiles` — for every file where
  `extractYamlBlock` returns `null`, call `appendQuarantine` with
  `reason: 'no_frontmatter'`. For every file where
  `parseFrontmatterBlock` returns an invalid status, call
  `appendQuarantine` with `reason: 'invalid_status'` (and the
  offending value as `detail`). Continue scanning.
- `readProposalFile` — remove the `isProposalStatus(fm.status) ?
  fm.status : 'pending'` fallback. Instead, return either
  `{ ok: true, value: canonical fm }` or `{ ok: false, reason:
  'invalid_status', detail: fm.status }`. The caller routes to
  quarantine.

### S3 — State health / state repair surface

`plugins/proposals/src/lib/tools/state-repair.tool.ts` and
`state-health.tool.ts`:

- `state_health` includes a `quarantine: { count, recent: [...last
  10] }` block.
- `state_repair` adds `action: 'quarantine_resolve'` with the three
  actions above.

### S4 — Tests

`plugins/proposals/tests/src/lib/proposals/quarantine.spec.ts`:

- A fixture file with `2026-09-06-x00504-superseded-by-...md` is
  quarantined (not indexed).
- A fixture file with `readme.md` is quarantined (not silently
  dropped).
- A fixture file with `f00501.md` (no frontmatter) is quarantined.
- A fixture file with `status: foo` is quarantined.
- A fixture file with the canonical regex AND valid frontmatter is
  indexed normally (sanity check).
- `state_repair { action: 'quarantine_resolve', id, action: 'adopt' }`
  on a fixture with a renamed-to-canonical filename promotes the
  file to the registry.

### S5 — Lint

`tools/scripts/lint/no-silent-drop-on-invalid-frontmatter.script.ts`:

- Walk `plugins/proposals/src/lib/proposals/sync-proposal-registry.ts`.
- Flag any `continue` inside a `.map` / `for` loop whose guard is
  a regex / parse failure without a paired
  `appendQuarantine` call.
- Wire into `bun run validate`.

## Acceptance

- The four silent-drop patterns in the reconciliador route to
  `appendQuarantine` instead of `continue`.
- `readProposalFile` removes the `isProposalStatus ? : 'pending'`
  fallback; callers route invalid metadata to quarantine.
- `state_health.quarantine` and `state_repair { action:
  'quarantine_resolve' }` work end-to-end.
- The new tests exit 0.
- `bun run validate` stays green.

## Out of scope

- Moving the quarantine table from JSONL to SQLite — that lands in
  q00019 S1. Phase 0 ships the JSONL format so the contract is
  proven.
- Bulk migration of legacy `pNNN-*.md` files. Those remain in the
  legacy reconciliador until S11/S12 of q00018.
- Removing the regex mismatch between runtime scan and
  `filename-linter.ts` (separate fix).