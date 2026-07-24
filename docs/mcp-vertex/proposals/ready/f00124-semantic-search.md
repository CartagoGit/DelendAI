---
id: f00124
kind: feat
title: semantic search — optional local embedding layer + hybrid ranking on the existing search plugin (find by meaning, zero-config)
status: ready
date: 2026-07-23
track: plugin+search+navigation
---

# f00124 — semantic search

## goal

Upgrade the existing `search` plugin (today BM25/text only) with an **optional
local semantic layer**: embedding-based "find by meaning" plus **hybrid
ranking** (BM25 ⊕ vector) so navigating a large codebase surfaces
conceptually-related code, not just lexical matches. **Zero-config**: the index
builds lazily into `pluginCacheDir`, needs **no external service and no API
key**, and BM25 stays the default so nothing regresses.

## why

Semantic code search is the key navigation differentiator (Cursor,
Sourcegraph), and lexical `search` misses conceptual matches in a big repo —
this one. Better orientation is a direct dogfooding win: the project has a
recorded incident where agents ran many searches that "scanned 0" and lost the
plot; higher-recall, meaning-aware search makes every agent working on
mcp-vertex faster and less likely to flail.

## why this design

**Extend `search`, don't fork it.** Add a pure hybrid ranker
(`fuseRankings(bm25, vector, weights)`) and a local embedding backend behind an
**injected `embed` seam**. The default embedder is small and local (no key, no
network); if a provider key is already present, the plugin can *offer*
higher-quality API embeddings opt-in — reusing `auto-agent-selector`'s
discovery so we never ask for a key we can detect. The index is persisted to
`pluginCacheDir` and built **incrementally**. BM25 remains the zero-dependency
default and the semantic layer degrades gracefully to it, so search never gets
slower or key-dependent by default.

## non-goals

- No mandatory external embedding API and no key required for the default.
- No giant bundled model — the default embedder is lightweight/local.
- Does not replace BM25 — hybrid ranking keeps lexical precision.
- No cross-repo or network index — everything stays in `pluginCacheDir`.

## slices

### S1 — hybrid ranker (pure)

- **Status**: pending
- **Files**: `plugins/search/src/lib/rank/fuse.ts`, `plugins/search/src/lib/contracts/interfaces/hybrid-rank.interface.ts`
- **Gate**: bun run validate

Pure `fuseRankings(bm25Scores, vectorScores, weights)` with reciprocal-rank
fusion; identity to BM25 when no vectors exist. Exhaustively unit-tested,
including the graceful-degradation path.

### S2 — local incremental embedding index

- **Status**: pending
- **Files**: `plugins/search/src/lib/embed/`, `plugins/search/src/lib/tools/search-semantic.tool.ts`
- **Gate**: bun run validate

Incremental index build to `pluginCacheDir` over an injected `embed` seam
(default local); `search` gains a `mode: hybrid|lexical|semantic`. Index keyed
by content hash so only changed files re-embed. Falls back to lexical if the
embedder is unavailable.

### S3 — optional API embeddings + pack auto-tuning

- **Status**: pending
- **Files**: `plugins/search/src/lib/embed/providers.ts`, `packages/core/src/lib/plugins/pack-defaults.ts`
- **Gate**: bun run validate

If a provider key is discovered (reuse `auto-agent-selector` discovery), offer
opt-in API embeddings for higher quality; packs (r00011) tune the hybrid
weights per stack. Never activates without an existing key + consent.

## acceptance

- `bun run validate` → exit 0 (incl. `verify:tools`).
- Hybrid search returns conceptually-related results that a pure BM25 query
  misses on a fixture, while keeping BM25's exact-match precision.
- The default path needs **no** API key or external service; the index is
  incremental (unchanged files are not re-embedded).
- Lexical mode is byte-for-byte the current behaviour (no regression).

## notes

Reuses the `search` BM25 core, `pluginCacheDir`, and `auto-agent-selector`
provider discovery. Prior art: Sourcegraph embeddings, Cursor semantic index,
reciprocal-rank fusion. Addresses the "search scanned 0 / low recall" class of
orientation failure recorded in the project history.
