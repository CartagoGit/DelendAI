---
id: f00086
status: ready
type: proposal
track: core+orchestration+metrics
date: 2026-06-28
---

# f00086 — Token cost governance — cache control + system prompt bloat reduction + per-turn cost visibility

## Goal

# Token cost governance

## Goal

Make mcp-vertex sessions cheap enough that the orchestration overhead pays for itself in tokens saved. Today the system prompt of a default mcp-vertex session is 3-5× larger than a vanilla Copilot session, and per-turn cost varies 50× (from $0.001 to $0.067 in a 30-min audit on `agent/copilot-minimax-m3`) depending on whether the model cache hits or not. The cache is broken by tool calls, worktree changes, and proposal updates. Users pay for context they never read.

This proposal makes cost **transparent** (S2), the cache **warm by default** (S6), and the system prompt **right-sized** (S3 / S4 / S5). The expected outcome: a default mcp-vertex session costs ≤ $0.10/hour on the Go tier for a typical 50-turn workflow, down from the current ~$1.26/hour.

## Why

A 2026-06-28 audit of a 30-min session showed $0.63 of API spend for ~50 tool calls. The largest single cost (33k input, 3k output = $0.067) was explained entirely by a cache miss. The "Go" tier loses its cheap-tier advantage when the cache misses 30%+ of turns — and mcp-vertex's default config breaks the cache every time a tool returns, a worktree switches, or a proposal updates.

mcp-vertex has the pieces to fix this: `mcp-vertex_metrics` (S2), `--preset` registry (S4), `compact: true` on `mcp-vertex_overview` (S5), `cacheControl: { type: 'ephemeral' }` (S1), and the host extension's `activate()` hook (S6). They just aren't wired. The fix is orchestration-level, not a per-tool patch.

## Non-goals

- Per-byte LRU/LFU cache (over-engineering for a 1-2 MB system prompt).
- Migrating non-Anthropic / non-OpenAI providers (cache_control is provider-specific).
- Eliminating the catalog from the prompt (it is the load-bearing discovery contract).
- Forcing `--preset=lean` on existing users (opt-in, like `--preset=swarm`).

## Architecture

Six parallel slices, all file-disjoint. **S1** is the foundation (cache headers). **S2** surfaces the cost. **S3 / S4 / S5** reduce it. **S6** ensures the first turn of every session hits the cache.

- **S1 — Cache control headers in providers** (anthropic.ts, openai.ts)
- **S2 — `mcp-vertex_cache_metrics` tool** (new tool + registry)
- **S3 — System prompt size lint** (`bun run lint:prompt-size`)
- **S4 — `--preset=lean`** (4 of 16 plugins, doc page)
- **S5 — Compact-by-default** for `mcp-vertex_overview` and `proposals_auto_work`
- **S6 — Cache warm-up on VS Code session start** (host `activate()`)

S2, S3, S4, S5 are all claimable in parallel. S6 depends on S1 (warm-up requires cache headers in place). S1 is the foundation; close it first.

## Acceptance (whole proposal)

- `bun run typecheck` exits 0
- `bun run lint:tools` exits 0
- `bun run lint:prompt-size` exits 0
- `bun run validate` exits 0
- A 50-turn session on `--preset=lean` + warm cache stays under $0.10/hour on the Go tier, verified via `mcp-vertex_cache_metrics`.

## Slices

- global_gate: type

### s1 — Cache control headers in providers (anthropic, openai)
- files: packages/core/src/lib/providers/cache-control.ts
- files: packages/core/src/lib/providers/anthropic.ts
- files: packages/core/src/lib/providers/openai.ts
- gate: type
- acceptance:
  - "new file packages/core/src/lib/providers/cache-control.ts implements CacheControlOptions type and buildCacheControl() helper exported via @mcp-vertex/core/public"
  - "anthropic.ts and openai.ts add cacheControl: { type: 'ephemeral' } to the system message segment only (not to user / tool messages)"
  - "packages/core/tests/src/lib/providers/cache-control.spec.ts covers both providers, verifying the system segment is tagged and other segments are not"
  - "bun run typecheck exits 0"
- status: pending

### s2 — mcp-vertex_cache_metrics tool for per-turn cost visibility
- files: packages/core/src/lib/tools/cache-metrics-tool.ts
- files: packages/core/src/lib/tools/registry.ts
- gate: type
- acceptance:
  - "new file packages/core/src/lib/tools/cache-metrics-tool.ts implements the tool handler with inputSchema (windowMinutes: number, limit: number) and outputSchema (inputTokens, outputTokens, cacheHitRate, costUSD, topExpensiveTurns[])"
  - "registry.ts registers the tool in the default set with the namespace 'mcp-vertex' so it surfaces in mcp-vertex_agent_catalog"
  - "packages/core/tests/src/lib/tools/cache-metrics.spec.ts covers schema, output shape, zero-state, and a mock session with 5 turns"
  - "bun run typecheck exits 0"
  - "bun run catalog:generate regenerates with the new tool documented"
- status: pending

### s3 — System prompt size lint (bun run lint:prompt-size)
- files: tools/scripts/lint/system-prompt-size.script.ts
- files: tools/scripts/lint/index.ts
- files: package.json
- gate: lint
- acceptance:
  - "new file tools/scripts/lint/system-prompt-size.script.ts walks AGENTS.md, CLAUDE.md, .github/copilot-instructions.md (when present) and reports per-file byte count + total"
  - "script fails (exit 1) if any individual file > 25 KB or total > 60 KB; threshold is configurable via --max-file / --max-total flags"
  - "package.json adds a 'lint:prompt-size' script that calls the script"
  - "tools/scripts/lint/index.ts wires the new script into the lint:all aggregator"
  - "tools/scripts/lint/__tests__/system-prompt-size.spec.ts covers pass, individual-file-fail, total-fail, and missing-file cases with fixtures"
  - "bun run lint:prompt-size exits 0 on the current repo"
- status: pending

### s4 — Lean preset (4 essential plugins only) + docs page
- files: packages/core/src/lib/presets/lean.preset.ts
- files: packages/core/src/lib/presets/registry.ts
- files: apps/web/src/pages/docs/presets/lean.astro
- gate: type
- acceptance:
  - "new file packages/core/src/lib/presets/lean.preset.ts exports LEAN_PRESET plugin set: proposals, status-marker, quality, search only (4 of 16)"
  - "registry.ts registers the lean preset so --preset=lean resolves it"
  - "new file apps/web/src/pages/docs/presets/lean.astro documents the lean preset, its tool count (< 50% of swarm), when to use it, and the migration path from --preset=swarm"
  - "packages/core/tests/src/lib/presets/lean.spec.ts verifies the lean preset loads only 4 plugins and exposes < 50% of swarm's tool count"
  - "bun run typecheck exits 0"
  - "bun run site:strict exits 0 (i18n complete for the new doc page in all 12 languages)"
- status: pending

### s5 — Compact-by-default for mcp-vertex_overview and proposals_auto_work
- files: packages/core/src/lib/tools/overview-tool.ts
- files: packages/core/src/lib/tools/auto-work-tool.ts
- gate: type
- acceptance:
  - "overview-tool.ts: when called with empty input {}, defaults to compact: true (verbose is opt-in via explicit verbose: true)"
  - "auto-work-tool.ts: when called with empty input {}, defaults to compact: true (the verbose path still works when explicitly requested)"
  - "packages/core/tests/src/lib/tools/overview-compact-default.spec.ts snapshot-tests that the default output is < 2 KB and contains no pluginErrors / loadedPlugins verbose keys"
  - "packages/core/tests/src/lib/tools/auto-work-compact-default.spec.ts verifies the compact default keeps proposalList ≤ 3 items and omits description text"
  - "bun run typecheck exits 0"
- status: pending

### s6 — Cache warm-up on VS Code session start
- files: extensions/vscode/src/services/cache-warm.ts
- files: extensions/vscode/src/extension.ts
- depends_on: [s1]
- gate: type
- acceptance:
  - "new file extensions/vscode/src/services/cache-warm.ts exports warmCache(): a one-shot mcp-vertex_overview { compact: true } call on session open, with 5s timeout and silent-fail (never blocks UI, never surfaces errors to the user)"
  - "extension.ts activate() calls warmCache() once after the host server is ready, behind a config flag cacheWarmOnActivate (default true)"
  - "extensions/vscode/tests/src/services/cache-warm.spec.ts covers happy path, timeout, silent-fail, and disabled-via-config cases"
  - "bun run typecheck exits 0"
  - "manual verification: first real user turn after session open shows cacheHit: true in mcp-vertex_cache_metrics"
- status: pending
