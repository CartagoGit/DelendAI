---
id: l00004
status: ready
type: proposal
track: plugins
date: 2026-06-21
kind: feat
title: Plugin depth extension — search (rg + context), memory (export/import), docs (docs_search)
---

# l00004 — Plugin depth extension — `search` (rg + context), `memory` (export/import), `docs` (`docs_search`)

## Goal

Close the master audit's M33 follow-up (line 598) by adding the three
plugin-depth improvements that were explicitly **not addressed in session
21-06** and are still on the audit:

- **`search`**: optional `rg` (ripgrep) backend when the binary is on
  `$PATH`, plus a `context:N` parameter that returns N lines before/after
  each hit. Both behind `respectGitignore` and the existing containment
  guard (M22).
- **`memory`**: `memory_export` (returns the full store as JSON or NDJSON)
  and `memory_import` (replaces or merges; redactSecrets runs on the
  input by default; conflict resolution is per-key with `overwrite` /
  `skip` / `merge`).
- **`docs`**: `docs_search` (regex/glob over doc titles + bodies, returns
  ranked hits with snippets; respects the same containment + size caps as
  `docs_list`).

## Why

- The 3rd-party agnostic audit (Codex, 18-06) and the master audit both
  flag these as the most-requested follow-ups after M11 closed
  `search`/`memory`/`docs` quick wins.
- All three are **additive** (new tools / new optional behaviours) — none
  of them change existing tool semantics or break consumers.
- All three are well-bounded: each slice is ≤ 1 day of work with a clear
  spec.

## Non-goals

- Replacing the default `search` engine with `rg` by default — `rg` is an
  *opt-in fallback* (faster on huge repos, requires the user to install
  it). Default stays on the in-house async walker.
- Touching the on-disk memory store format (export/import are JSON
  snapshots of the same store; no migration needed).
- Full-text indexing for `docs_search` (it's a linear scan with the
  existing `search` engine underneath; for the 10–50 docs typically
  present, that's < 5 ms).

## Slices

### S1 — `search`: optional `rg` backend + `context:N`
  - **Status**: ready
  - **Files**: `plugins/search/src/lib/engine.ts` (add `RgBackend` class
    that shells out to `rg --json` with the same containment guard;
    selected when `options.preferRg: true` AND `rg` is on `$PATH`,
    else falls back to the in-house walker with a one-time warn in the
    response), `plugins/search/src/lib/tools.ts` (add `context` parameter
    to `search_query` with default 0, max 10), `plugins/search/tests/...`
    (new spec: 6 cases — rg available + preferRg, rg missing, context:0
    unchanged, context:3 returns N lines, containment guard still
    applies, no false matches on `.git/`).
  - **Command**: `bun run validate`
  - **Expect**: green.

### S2 — `memory`: export/import
  - **Status**: ready
  - **Files**: `plugins/memory/src/lib/tools.ts` (add `memory_export`:
    `format: 'json'|'ndjson'`, `includeExpired: boolean?` — defaults to
    false; `memory_import`: `mode: 'replace'|'merge'`, `conflict:
    'overwrite'|'skip'|'merge'`; both go through the same
    `withFileMutex` + `redactSecrets` as `memory_save`),
    `plugins/memory/tests/src/lib/tools.spec.ts` (new spec: 8 cases —
    export empty store, export with expired items excluded, import
    replace, import merge no conflict, import merge with skip, import
    merge with overwrite, import with secret redaction, round-trip
    equality).
  - **Command**: `bun run validate`
  - **Expect**: green; `bun run smoke:pack` still works.

### S3 — `docs`: `docs_search`
  - **Status**: ready
  - **Files**: `plugins/docs/src/lib/engine.ts` (add `searchDocs(query,
    limit?, include?)` that walks the same files as `docs_list`, scores
    matches by `(titleHit * 3) + bodyHit`, returns ranked snippets of
    ≤ 200 chars around the hit), `plugins/docs/src/lib/tools.ts` (add
    `docs_search` tool with `outputSchema` explicit per the l00002
    proposal; takes `query: string`, `limit?: number (default 10)`,
    `include?: string[]`),
    `plugins/docs/tests/src/lib/engine-search.spec.ts` (new spec: 5
    cases — title hit ranks first, body hit, empty query returns [], no
    matches returns [], limit cap respected).
  - **Command**: `bun run validate`
  - **Expect**: green; the new tool shows up in `overview` with
    `effects: []` (read-only).

### S4 — Audit close
  - **Status**: ready
  - **Files**: `docs/proposals/audits/a1-16-06-2026-…md` (line 598 → `[x]`
    with link to this proposal; the three sub-bullets
    `search`/`memory`/`docs` are now `[x]` each).
  - **Command**: none.
  - **Expect**: master audit line 598 is `[x]`.

## Acceptance

- [ ] `search_query` accepts `context: N` (0 ≤ N ≤ 10) and returns N
      surrounding lines per hit.
- [ ] `search_query` with `preferRg: true` uses `rg` when available.
- [ ] `memory_export` / `memory_import` round-trip preserves all
      non-expired entries; secrets are redacted on import.
- [ ] `docs_search` returns ranked hits with snippets.
- [ ] Master audit line 598 is `[x]`.

## Risk register

- **R1 — `rg` JSON output is not stable across versions**: pin to
  `rg --json` format ≥ 12.0 (the documented stable line shape); the spec
  uses the documented fields only and asserts on them.
- **R2 — `memory_import` with `mode: 'replace'` is destructive**: the
  tool's `effects: ['write', 'destructive']` is set explicitly; the
  outputSchema names the modes so a CLI consumer can show a confirmation
  prompt.
- **R3 — `docs_search` is linear**: fine for the 10–50 doc scale we
  have; documented as a known limit. If a future user hits thousands of
  docs, the proposal to add an index is `l999` (placeholder).

## Linked references

- Master audit: `docs/proposals/audits/a1-16-06-2026- Auditoría Maestra (Unificada).md` (line 598).
- M11 closure (search .gitignore, memory TTL/redact, docs pagination):
  same audit §7 "P2 — Calidad de producto".
- M22 containment guard: `packages/core/src/lib/shared/contain-path.ts`.
- M23 redact: `packages/core/src/lib/shared/redact.ts`.
- `docs_list` / `docs_read`: `plugins/docs/src/lib/tools.ts` (the model
  for the new `docs_search` tool).
