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

- **Status**: done
- **Files**:
  - `packages/proposals-sqlite/src/lib/schema.ts` (modified — adds
    the proposals_fts, plans_fts, and slices_fts virtual tables)
  - `packages/proposals-sqlite/src/lib/migrations/0010_fts5.sql`
    (modified — virtual tables, triggers, and initial rebuild)
  - `packages/proposals-sqlite/tests/src/lib/fts.spec.ts`
    (new)
- **Gate**: type
- acceptance:
  - FTS5 schema applied via `CREATE VIRTUAL TABLE ... USING fts5(...
    tokenize = 'unicode61')`.
  - Triggers keep the FTS tables in sync on every proposal/plan/slice
    write.
  - Rebuild statements are part of migration `0010_fts5.sql`, which is
    recorded in `schema_migrations`, so existing rows are indexed on
    first open.
  - `bun run typecheck` green.
- review-state: done
- review-implementer: delendai-impl-20260908
- review-reviewer: delivery_verifier
- review-log: requested_changes by claude-opus-5-auditor — Tres de las cuatro aceptaciones se cumplen y estan verificadas leyendo 0010_fts5.sql: las tres tablas virtuales usan CREATE VIRTUAL TABLE ... USING fts5 con tokenize = 'unicode61' (lineas 17, 24, 31) y hay nueve triggers ai/au/ad que cubren INSERT, UPDATE y DELETE sobre proposals, plans y slices (lineas 38-95). tests/src/lib/fts.spec.ts pasa 4/4 y el typecheck del repositorio esta limpio. La tercera aceptacion NO se cumple. Dice: 'A REBUILD proposals_fts is part of schema_migrations so the FTS index is regenerated on first open'. En el arbol el rebuild existe unicamente como texto dentro del comentario de cabecera del .sql (linea 12), que ademas afirma 'the bootstrap path runs this when the schema version advances past 10'. No hay tal bootstrap path: grep de 'rebuild' sobre packages/proposals-sqlite/src no devuelve ninguna sentencia INSERT INTO <tabla>_fts(<tabla>_fts) VALUES('rebuild') ni codigo que la ejecute; los unicos aciertos son el literal del comentario, el tipo de kind en reconciler-runs.ts y la lista CHECK de 0002. Consecuencia concreta: una base de datos que ya tenga filas y migre a la version 10 se queda con las tres tablas FTS vacias, porque los triggers solo indexan escrituras posteriores a la migracion. La busqueda devolveria cero resultados sobre todo el contenido preexistente, que es justo el caso de uso. Para cerrar: anadir la sentencia de rebuild al propio 0010_fts5.sql (es idempotente y corre dentro de la migracion, que es lo que la aceptacion pide al decir 'part of schema_migrations'), y un test que inserte filas ANTES de aplicar la migracion FTS y compruebe que despues son encontrables. Nota menor: el slice declara el spec en tests/src/lib/repository/fts.spec.ts y esta en tests/src/lib/fts.spec.ts; alinear la ruta declarada con la real. Segunda nota, ya corregida en 37bb237b4 y por tanto no pendiente: la migracion aterrizo sin subir PROPOSALS_SQLITE_SCHEMA_VERSION (seguia en 9) ni actualizar la lista esperada de MIGRATION_FILES, lo que dejo seis tests del driver en rojo en develop.
- review-log: approved by delivery_verifier — Revisión independiente completada sobre 6b1ac5ca6. La migración crea las tablas FTS5 unicode61, mantiene los nueve triggers ai/au/ad y reconstruye explícitamente los índices standalone desde proposals, plans y slices para conservar datos preexistentes. La prueba focalizada pasa 5/5 con 6 expectativas y el typecheck está limpio.
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