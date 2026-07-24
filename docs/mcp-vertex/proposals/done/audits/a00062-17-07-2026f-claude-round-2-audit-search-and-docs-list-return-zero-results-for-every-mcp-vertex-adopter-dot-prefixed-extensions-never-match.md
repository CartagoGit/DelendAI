---
id: a00062
title: "17-07-2026f claude-round-2 audit — search and docs_list return zero results for every mcp-vertex adopter (dot-prefixed extensions never match)"
kind: audit
status: done
type: proposal
track: audit
date: 2026-07-16
---

# a00062 — 17-07-2026f claude-round-2 audit — search and docs_list return zero results for every mcp-vertex adopter (dot-prefixed extensions never match)

## Goal

Continuing the "actually run it" theme (a00058-a00061), ran the LIVE mcp-vertex_search_search tool this very session was already using (not a fresh install) and got scanned:0, count:0 for a query ("McpStdioClient") that unambiguously exists in dozens of files. mcp-vertex_docs_docs_list returned the same empty result. Both are real, previously-invisible defects, not stale-session artifacts — reproduced identically via a freshly-spawned server through the real CLI.

Root cause, found by adding temporary file-based debug logging through the whole call chain (workspace root resolution -> directory walk -> per-file filter) and removing it once isolated: the search engine's `extensionOf(name)` (and the docs engine's identical `extOf(abs)`) return a bare, dot-less extension ("ts", "md" — confirmed by their own docstrings: "without dot"), but `mcp-vertex.config.json`'s `plugins.search.options.extensions` / `plugins.docs.options.extensions` are written dot-prefixed (".ts", ".md" — the natural authoring convention, matching Node's own `path.extname()`). `extensions.has(extensionOf(name))` therefore NEVER matched, silently degrading the search/docs walk's per-file filter to "reject everything" — every directory was walked correctly (confirmed via debug logging: readdir found real entries at every level), but zero files ever passed the extension gate, so `scanned` stayed 0 and both tools always returned empty.

This isn't just this repo's own misconfiguration: `packages/core/src/lib/plugins/plugin-defaults.ts` and its duplicate `packages/cli/src/contracts/constants/plugin-defaults.constant.ts` (the canonical `PLUGIN_DEFAULTS` map that `init`/`init:default` write into every new adopter's `mcp-vertex.config.json`) both hardcode the SAME dot-prefixed extensions — meaning search and docs_list have most likely returned zero results for every repo that ever adopted mcp-vertex via `init`, since these defaults were written.

Fixed defensively (not just cosmetically): normalized both engines (`search-engine.in-house.ts`, `docs/engine.ts`) to strip a leading dot from config-supplied extensions before building the match Set, so either spelling works going forward regardless of how a host writes its config. Also corrected the canonical defaults (both `PLUGIN_DEFAULTS` copies) and this repo's own committed `mcp-vertex.config.json` to the dot-less canonical form, matching the engines' own documented convention. Verified live: search now returns real hits (20/124 scanned before truncation) and docs list returns 50 real documents, from a freshly-spawned server.

## why

User directive: keep pushing every dimension to 11/10. This is the highest-blast-radius finding of the a00057-a00062 audit run: not an edge case or a near-miss, but two entire tools silently non-functional for every consumer who ever bootstrapped mcp-vertex via its own init flow — found only because a search for a symbol I KNEW existed came back empty.

## non-goals

- No change to the rg backend (search-engine.backends.ts) — it has no extension allow-list of its own (rg handles file-type filtering independently), so it was never affected.
- No change to plugins/conventions's fileExtensions (a different, already dot-consistent convention using String.endsWith(ext) with the dot included) — confirmed unrelated after checking, left untouched.
- No attempt to audit every other plugin for a similar dot-convention mismatch beyond search/docs, which share the exact same extOf()-without-dot helper — grepped the whole repo for the dot-prefixed-array literal pattern and found only this pair plus the two PLUGIN_DEFAULTS copies.

## Slices

- global_gate: e2e

### S1 — Fix the dot-prefix mismatch in both engines + both canonical defaults + this repo's own config
- **Status**: done
- **Files**: `plugins/search/src/lib/services/search-engine.in-house.ts`, `plugins/search/tests/src/lib/services/search.service.spec.ts`, `plugins/docs/src/lib/services/engine.ts`, `plugins/docs/tests/src/lib/docs.spec.ts`, `packages/core/src/lib/plugins/plugin-defaults.ts`, `packages/cli/src/contracts/constants/plugin-defaults.constant.ts`, `packages/cli/src/lib/init/init-render.service.spec.ts`, `mcp-vertex.config.json`
- **Gate**: e2e
- acceptance:
  - "Root cause isolated via temporary, fully-removed debug instrumentation through the real call chain: workspace root correct, directory walk correct (readdir found real entries at every level), shouldSearch's final extensions.has(extensionOf(name)) always false because of the dot mismatch."
  - "Both engines now strip a leading dot from config-supplied extensions before building the match Set; new regression specs (dot-prefixed extensions still match) added to both plugins, confirmed red before the fix, green after."
  - "Both PLUGIN_DEFAULTS copies (core + cli) and this repo's own mcp-vertex.config.json corrected to the dot-less canonical form matching each engine's own documented convention; the one spec that pinned the old dot-prefixed default (init-render.service.spec.ts) updated to match."
  - "Verified live against a freshly-spawned server (not the already-running session server): mcp-vertex_search_search for a known-real symbol returns actual hits (20 results, 124 files scanned before truncation, was 0/0); mcp-vertex_docs_docs_list returns 50 real documents (was 0)."
  - "bun run typecheck clean; full bun run test: 548/548 files, 4587/4587 tests green (one coordination-chaos.spec.ts flake under full-suite load, re-verified isolated-pass — the known flaky-under-load class, not a regression)."

## acceptance

- Root cause isolated via temporary, fully-removed debug instrumentation through the real call chain: workspace root correct, directory walk correct (readdir found real entries at every level), shouldSearch's final extensions.has(extensionOf(name)) always false because of the dot mismatch.
- Both engines now strip a leading dot from config-supplied extensions before building the match Set; new regression specs (dot-prefixed extensions still match) added to both plugins, confirmed red before the fix, green after.
- Both PLUGIN_DEFAULTS copies (core + cli) and this repo's own mcp-vertex.config.json corrected to the dot-less canonical form matching each engine's own documented convention; the one spec that pinned the old dot-prefixed default (init-render.service.spec.ts) updated to match.
- Verified live against a freshly-spawned server (not the already-running session server): mcp-vertex_search_search for a known-real symbol returns actual hits (20 results, 124 files scanned before truncation, was 0/0); mcp-vertex_docs_docs_list returns 50 real documents (was 0).
- bun run typecheck clean; full bun run test: 548/548 files, 4587/4587 tests green (one coordination-chaos.spec.ts flake under full-suite load, re-verified isolated-pass — the known flaky-under-load class, not a regression).

## Verified State

| Verification | Value |
|---|---|
| Repro (before fix) | `mcp-vertex_search_search({query:"McpStdioClient"})` on the already-running session server → `{"count":0,"scanned":0,"hits":[]}`; `mcp-vertex_docs_docs_list()` → `{"count":0,"docs":[]}` |
| Repro reproduced on a fresh server | `bun packages/cli/src/index.ts search McpStdioClient --workspace=. --json` (spawns a brand-new server via source, unrelated to the already-running session server) → identical `count:0/scanned:0` |
| Isolation confirmed workspace root was NOT the problem | `mcp-vertex_fs_read({path:"package.json"})` and `mcp-vertex_git_status()` both returned correct, real data against the true repo root — ruling out a stale/wrong workspace root |
| Isolation confirmed the engine itself was NOT the problem | Calling `searchWorkspace()` directly in a throwaway script with the exact same absolute root and `roots:['.']` found real hits immediately |
| Debug trace (temporary, fully reverted after) | `walkAllowedFiles` correctly enumerated real directory entries at every level (600+ debug lines, real filenames); `shouldSearch()` returned `false` for all 2287 files checked; final trace pinpointed `extensions.has(extensionOf(name))` — `extensionOf("index.ts")` → `"ts"`, but the config-supplied `extensionsSet` was `[".ts",".tsx",".js",".mjs",".cjs",".md",".json"]` (dot-prefixed) |
| Root defaults confirmed broken | `packages/core/src/lib/plugins/plugin-defaults.ts` and `packages/cli/src/contracts/constants/plugin-defaults.constant.ts` (both consumed by `init`/`init:default` to materialize every new adopter's config) hardcoded the same dot-prefixed extensions |
| Fix verified live (fresh server, post-fix) | `search` → `{"count":20,"scanned":124,"truncated":true,"hits":[...real hits...]}`; `docs list` → `{"count":50,"docs":[...real docs...]}` |
| `bun run typecheck` | clean (0 errors) |
| `bun run test` (full suite) | 548/548 files, 4587/4587 tests green; one `coordination-chaos.spec.ts` timeout under full-suite load, re-verified isolated-pass (known flaky-under-load class) |

## Findings

### 1. `search` and `docs_list` silently returned zero results for every mcp-vertex adopter (P0 · two core tools non-functional)
**File**: [`plugins/search/src/lib/services/search-engine.in-house.ts#L72-L77`](plugins/search/src/lib/services/search-engine.in-house.ts) (pre-fix), [`plugins/docs/src/lib/services/engine.ts#L82-L87`](plugins/docs/src/lib/services/engine.ts) (pre-fix), [`packages/core/src/lib/plugins/plugin-defaults.ts#L20,31`](packages/core/src/lib/plugins/plugin-defaults.ts), [`packages/cli/src/contracts/constants/plugin-defaults.constant.ts#L34,47`](packages/cli/src/contracts/constants/plugin-defaults.constant.ts).
**Impact**: `extensionOf()`/`extOf()` return a bare, dot-less extension by design (their own docstrings say so), but the canonical `PLUGIN_DEFAULTS` templates that `init`/`init:default` write into EVERY new adopter's `mcp-vertex.config.json` supply dot-prefixed extensions — the natural authoring convention anyone would reach for, matching `path.extname()`. The mismatch means the extension allow-list check `extensions.has(extensionOf(name))` was `false` for literally every file, for every repo that ever ran `mcpv init`/`init:default` and got a config with this default. Two tools that are core to how an agent orients in an unfamiliar repo (grep-like search, doc discovery) returned empty results with no error, no warning — indistinguishable from "there's nothing to find."
**Resolution**: [RESUELTO] — both engines now strip a leading dot before matching (tolerant of either spelling going forward); both `PLUGIN_DEFAULTS` copies and this repo's own config corrected to the canonical dot-less form; regression specs added to both plugins; verified live end-to-end.

## Scoreboard

| Dimension | Before | After |
|---|---|---|
| `search` tool functional for a config-supplied extensions list | no (0 results always) | yes (verified live, 20 hits / 124 scanned) |
| `docs_list` tool functional for a config-supplied extensions list | no (0 results always) | yes (verified live, 50 docs) |
| New adopters bootstrapped via `init`/`init:default` | inherit the same broken defaults | inherit corrected, working defaults |
| Engine robustness to either dot spelling | no (silent failure) | yes (both spellings normalize identically) |
| Overall (delta on top of a00057-a00061) | — | highest blast-radius finding of the run; two core tools restored for every past and future adopter of the fixed defaults |
