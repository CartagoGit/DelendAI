---
id: f00517
title: "Context compiler — token-budgeted context with summaries by content_hash"
kind: feat
status: ready
type: proposal
track: architecture
date: 2026-09-07
priority: P1
audit-source:
  file: docs/delendai/audits/2026-09-07-develop-external-audit.md
  finding: AUD-CONTEXT-COMPILER-028
  snapshot: 91bbbff76ce35452c8c8b6e3bf2129a490bf7c94
related:
  - q00022
  - f00514
  - f00516
---

# f00517 — Context compiler + summaries by hash

## Goal

Introduce a single tool that, given a task and a token budget, returns
the minimal sufficient context to answer it — using SQLite to fetch
only the rows the agent actually needs, FTS5 for lexical filtering,
cached summaries (`summary_cache` keyed by `content_hash`) for
expensive-to-render content, and a deterministic priority order. The
audit marks this as P1 because it is the single biggest lever for
token savings without changing models.

## Why

> No cargar índices completos al contexto. Otra fuente probable de
> tokens innecesarios: INDEX.json completo. Un modelo no debería tener
> que leer una tabla serializada entera sólo para saber: proposal
> P-312. SQLite debe responder exactamente lo necesario. Ideal:
> `get_context_for_work(current_slice, max_tokens=4000)` Y el backend
> construye determinísticamente el contexto.

> Resúmenes por hash. Para cada documento: `content_hash`, `summary`,
> `summary_model`, `summary_prompt_version`. Si el contenido no
> cambia: no regenerar summary. Esto puede ahorrar una barbaridad en
> repositorios grandes.

The current proposals plugin reads more than it needs: an agent that
wants to know "is proposal P-312 ready to close?" ends up reading the
whole INDEX. Context compilation shrinks that to the few rows that
matter.

## Why this design

**Layers L0–L5.** The compiler returns context in priority bands:
L0 (uid + status), L1 (metadata), L2 (relations), L3 (summary),
L4 (snippet), L5 (full body). The host picks the highest-priority
band that fits the budget.

**`summary_cache` keyed by content_hash.** Every time the compiler
needs an L3/L4 band for a document whose `content_hash` is in the
cache, it reuses the cached summary. The cache row records
`summary_model`, `summary_prompt_version`, and `created_at`, so we
know when a stale summary is being served.

**Deterministic priority.** Priority is a tuple `(recency, importance,
relevance)`. Importance is computed from `priority` frontmatter +
kind; relevance is the FTS5 score from `f00516`; recency is the
`updated_at` timestamp. The host never sees an LLM in the priority
computation.

**No LLM in the loop.** The compiler is pure; summaries are written
by the explicit `summary_backfill` command (an LLM step), not by the
compiler itself.

## non-goals

- Do NOT call any LLM inside `proposals_compile_context`. The tool is
  deterministic.
- Do NOT introduce an embedding-based relevance score; lexical FTS5 +
  metadata ranking is enough.

## Slices

- global_gate: lint

### S1 — `summary_cache` table + backfill command

- **Status**: pending
- **Files**:
  - `packages/proposals-sqlite/src/lib/schema.ts` (modified — adds
    `summary_cache`)
  - `packages/proposals-sqlite/src/lib/migrations.ts` (modified —
    `0011_summary_cache.sql`)
  - `packages/proposals-sqlite/src/lib/repository/summary-repo.ts`
    (new)
  - `packages/proposals-sqlite/src/lib/summary/backfill.ts` (new)
  - `plugins/proposals/src/lib/tools/summary-backfill.tool.ts` (new)
  - `plugins/proposals/tests/src/lib/tools/summary-backfill.tool.spec.ts`
    (new)
- **Gate**: type
- acceptance:
  - `summary_cache` schema: `(content_hash TEXT PRIMARY KEY,
    summary TEXT NOT NULL, summary_model TEXT NOT NULL,
    summary_prompt_version TEXT NOT NULL, created_at INTEGER NOT
    NULL)`.
  - `summaryBackfill({ kind, uid? })` iterates rows that lack a
    cached summary, computes the summary (out of scope: this slice
    wires the storage; an external LLM provider fills `summary`),
    and writes the cache row.
  - Re-running backfill on a row whose `content_hash` is unchanged
    is a no-op.

### S2 — `proposals_compile_context` tool with L0–L5 priority bands

- **Status**: pending
- **Files**:
  - `plugins/proposals/src/lib/services/context-compiler.ts` (new)
  - `plugins/proposals/src/lib/tools/compile-context.tool.ts` (new)
  - `plugins/proposals/tests/src/lib/services/context-compiler.spec.ts`
    (new)
  - `plugins/proposals/tests/src/lib/tools/compile-context.tool.spec.ts`
    (new)
- **Gate**: type
- acceptance:
  - `compileContext({ task, maxTokens, scope })` returns context
    grouped by band. The output fits `maxTokens` (verified by a
    tokeniser).
  - The compiler uses FTS5 (`f00516`) for lexical filtering, then
    applies the priority tuple.
  - When `summary_cache` has a row for a document, the compiler
    returns the summary instead of the full body.
  - The compiler is pure — no LLM calls — and the test asserts that.

### S3 — Token telemetry: every compile emits `compile_runs` row

- **Status**: pending
- **Files**:
  - `packages/proposals-sqlite/src/lib/schema.ts` (modified — adds
    `compile_runs`)
  - `packages/proposals-sqlite/src/lib/migrations.ts` (modified —
    `0012_compile_runs.sql`)
  - `packages/proposals-sqlite/src/lib/repository/compile-runs-repo.ts`
    (new)
  - `plugins/proposals/tests/src/lib/services/context-compiler-telemetry.spec.ts`
    (new)
- **Gate**: e2e
- acceptance:
  - Every `compile_context` invocation writes a `compile_runs` row
    with `rows_considered`, `rows_emitted`, `tokens_input`,
    `tokens_output`, `cache_hits`, `duration_ms`.
  - The telemetry test verifies the row count, the sum, and the
    cache-hit rate is non-zero when summaries are present.

## acceptance

- All S1-S3 slices land.
- `proposals_compile_context` is the canonical "give me the context I
  need" tool. The audit invariant #27 ("agente nunca debería comenzar
  por L5") is satisfied.
- The token telemetry surfaces the savings that context compilation
  produces (the audit invariant #33).

## notes

- Summaries are produced by an external LLM provider; this proposal
  owns the cache and the lookup, not the LLM step.
- The summary `content_hash` matches the proposal's `content_hash`
  from `q00022 S1`, so a stale summary can never be served for a
  changed document.