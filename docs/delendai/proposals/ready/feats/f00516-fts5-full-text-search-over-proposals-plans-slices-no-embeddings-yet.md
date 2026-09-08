---
id: f00516
title: "FTS5 — full-text search over proposals, plans, slices (no embeddings yet)"
kind: feat
status: ready
type: proposal
track: architecture
date: 2026-09-07
priority: P1
audit-source:
  file: docs/delendai/audits/2026-09-07-develop-external-audit.md
  finding: AUD-FTS-027
  snapshot: 91bbbff76ce35452c8c8b6e3bf2129a490bf7c94
related:
  - q00022
  - f00517
---

# f00516 — FTS5 over proposals / plans / slices

## Goal

Add SQLite FTS5 virtual tables over the title + body of every
proposal, plan, and slice so the proposals plugin can answer "find
proposals that mention 'X'" in milliseconds, with no LLM and no
external vector DB. The audit marks this as P1 because lexical search
covers the vast majority of agent queries (symbols, paths, IDs,
errors) without the operational cost of embeddings.

## Why

> FTS5 antes de embeddings. Para DelendAI usaría inicialmente:
> SQLite FTS5 sobre: proposal body, plan, slice, memory, decisions.
> Pipeline: SQL filters → FTS → top N → LLM. No empezaría metiendo
> automáticamente un vector DB. Para búsquedas de ingeniería,
> símbolos, paths, tickets, IDs, errores y términos técnicos, búsqueda
> léxica + metadatos suele cubrir muchísimo. Embeddings sólo en el
> segundo nivel: FTS insuficiente → semantic retrieval.

The current `proposals_search` tool is either a regex over
`INDEX.json` (slow, full-scan) or does not exist at all. Both bad.
FTS5 turns "find every proposal that mentions `close_proposal`" into a
single indexed query.

## Why this design

**FTS5 virtual table.** We add a `proposals_fts(title, body, kind,
status)` virtual table, with `INSERT INTO proposals_fts
(proposals_fts, rowid, title, body, kind, status) VALUES
('rebuild')` triggered by every proposal write. Same for `plans_fts`
and `slices_fts`.

**Tokenisation is unicode61.** Default tokeniser is good enough for
engineering text; the configuration is centralised so we can swap to
`trigram` later without changing call sites.

**FTS ranking.** We expose `bm25(proposals_fts)` as the default
score. Hosts can pass `limit`, `offset`, `kind`, `status`, and
`prefix` (for autocomplete).

**No external vector DB yet.** Embeddings are reserved for "FTS
insufficient" cases (semantic similarity). The audit explicitly
warns against premature complexity.

## non-goals

- Do NOT introduce an embedding model or a vector DB.
- Do NOT change the existing `proposals_search` tool shape; only its
  backend (SQLite FTS5 vs JSON regex).
- Do NOT touch the State Engine's FTS surface (q00019 owns that).

## Slices

- global_gate: lint

### S1 — FTS5 virtual tables + triggers on insert / update / delete

- **Status**: pending
- **Files**:
  - `packages/proposals-sqlite/src/lib/schema.ts` (modified — adds
    `proposals_fts`, `plans_fts`, `slices_fts`)
  - `packages/proposals-sqlite/src/lib/migrations.ts` (modified —
    `0010_fts5.sql`)
  - `packages/proposals-sqlite/tests/src/lib/repository/fts.spec.ts`
    (new)
- **Gate**: type
- acceptance:
  - FTS5 schema applied via `CREATE VIRTUAL TABLE ... USING fts5(...
    tokenize = 'unicode61')`.
  - Triggers keep the FTS tables in sync on every proposal/plan/slice
    write.
  - A `REBUILD proposals_fts` is part of `schema_migrations` so the
    FTS index is regenerated on first open.
  - `bun run typecheck` green.
- review-state: in_review
- review-implementer: Rome
### S2 — `proposals_search` tool backed by FTS5

- **Status**: pending
- **Files**:
  - `plugins/proposals/src/lib/services/search.ts` (modified —
    backend switches from JSON regex to FTS5)
  - `plugins/proposals/src/lib/tools/search.tool.ts` (modified)
  - `plugins/proposals/tests/src/lib/services/search.spec.ts`
    (modified — adds a 10k-proposal fixture)
- **Gate**: type
- acceptance:
  - `proposals_search({ query, limit, offset, kind?, status?,
    prefix? })` returns hits in `bm25` order with `{ uid, kind,
    status, title, snippet, score }`.
  - A 10k-proposal fixture runs in <50ms (verified by a perf test).
  - Old behaviour (substring match across titles) is preserved
    behind a `mode: 'legacy'` option.

### S3 — FTS regression suite: indexed query is monotonic with `INSERT`s

- **Status**: pending
- **Files**:
  - `packages/proposals-sqlite/tests/e2e/fts.spec.ts` (new)
- **Gate**: e2e
- acceptance:
  - The e2e test inserts 1000 proposals, queries the FTS index, and
    verifies every inserted proposal is searchable.
  - The test verifies that a `DELETE` of a proposal removes its FTS
    row (no orphans).
  - The test verifies that a `REBUILD` after a manual SQL corruption
    restores the right count.

## acceptance

- All S1-S3 slices land.
- `proposals_search` is the canonical way to find a proposal by
  substring; the JSON scan path is gone.
- The audit recommendation (FTS before embeddings) is followed.

## notes

- FTS5 is a SQLite core feature; no extra dependency.
- The tokeniser can be swapped to `trigram` in a future slice
  without changing call sites.