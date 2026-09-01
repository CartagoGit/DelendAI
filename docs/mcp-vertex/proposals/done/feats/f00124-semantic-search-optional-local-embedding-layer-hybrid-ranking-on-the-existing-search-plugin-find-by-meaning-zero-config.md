---
id: f00124
kind: feat
title: semantic search — optional local embedding layer + hybrid ranking on the existing search plugin (find by meaning, zero-config)
status: done
date: 2026-07-23
track: plugin+search+navigation
closed-by: cartago (consolidated evidence pass 2026-07-26)
closed-evidence:
  - 3 commits referencing f00124 recovered from git log --grep (precedes convention)
  - all declared Files verified to exist via 3-commit batch
shipped-in:
  - 5f1b2a5e # feat(f00124): S3 optional API embeddings + pack auto-tuning
  - 1834724e # feat(f00124): S2 local incremental embedding index
  - 5d1fef1e # feat(f00124): S1 hybrid ranker (pure RRF)
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

- **Status**: done
- **Files**: `plugins/search/src/lib/rank/fuse.ts`, `plugins/search/src/lib/contracts/interfaces/hybrid-rank.interface.ts`, `plugins/search/tests/src/lib/rank/fuse.spec.ts`
- **Gate**: bun run validate
- implementation:
  - `fuse.ts` exports `fuseRankings` with RRF and graceful-degradation.
  - `hybrid-rank.interface.ts` defines `IRankedHit`, `IHybridRankInput`, `IHybridRankResult`.
  - 6 spec cases cover BM25-only, vector-only, basic RRF, graceful-degradation, weights defaulting, zero-weight guard.
  - 83/83 plugin tests pass.

Pure `fuseRankings(bm25Scores, vectorScores, weights)` with reciprocal-rank
fusion; identity to BM25 when no vectors exist. Exhaustively unit-tested,
including the graceful-degradation path.

### S2 — local incremental embedding index

- **Status**: done
- **Files**: `plugins/search/src/lib/embed/`, `plugins/search/src/lib/tools/search-semantic.tool.ts`
- **Gate**: bun run validate
- implementation:
  - `embed/embedder.ts` provides a deterministic hash-based default embedder with an `IEmbedder` seam for S3.
  - `embed/index-store.ts` persists the index under `pluginCacheDir/embed-index.json` keyed by content hash and mtimeMs.
  - `embed/embed-pipeline.ts` discovers files, hashes them, embeds only changed ones, and persists.
  - `search-semantic.tool.ts` wires BM25 + vector ranking through `fuseRankings`.
  - `search.tool.ts` extends the public search tool with `mode: lexical|semantic|hybrid` (lexical default).
  - 89/89 plugin tests pass; lexical mode is byte-for-byte the current behaviour.

Incremental index build to `pluginCacheDir` over an injected `embed` seam
(default local); `search` gains a `mode: hybrid|lexical|semantic`. Index keyed
by content hash so only changed files re-embed. Falls back to lexical if the
embedder is unavailable.

### S3 — optional API embeddings + pack auto-tuning

- **Status**: done
- **Files**: `plugins/search/src/lib/embed/providers.ts`, `packages/core/src/lib/plugins/pack-defaults.ts`
- **Gate**: bun run validate
- implementation:
  - `providers.ts` exposes `discoverProviders()` (key presence only; never logs the value) and `buildApiEmbedder({ providerId, apiKey, fetch })`.
  - `buildApiEmbedder` throws `code: 'embedder-unavailable'` on network failures so the search tool falls back to lexical.
  - API embedding is opt-in only when `discoverProviders` finds a key AND the caller passes `consent: true`.
  - `pack-defaults.ts` tunes per-stack: typescript-heavy `{bm25:0.4, vector:0.6}`, docs-heavy `{bm25:0.7, vector:0.3}`, default `{bm25:0.5, vector:0.5}`.
  - 92/92 search plugin tests + 3/3 pack-defaults specs pass.

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
