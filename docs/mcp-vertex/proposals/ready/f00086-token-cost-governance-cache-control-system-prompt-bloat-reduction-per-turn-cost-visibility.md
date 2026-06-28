---
id: f00086
status: ready
type: proposal
track: core+orchestration+metrics
date: 2026-06-28
kind: feat
title: Token cost governance — cache control + system prompt bloat reduction + per-turn cost visibility
---

# f00086 — Token cost governance

## goal

Make mcp-vertex sessions cheap enough that the orchestration overhead pays for itself in tokens saved. Today the system prompt of a default mcp-vertex session is 3-5× larger than a vanilla Copilot session, and per-turn cost varies 50× (from $0.001 to $0.067 in a 30-min audit on `agent/copilot-minimax-m3`) depending on whether the model cache hits or not. The cache is broken by tool calls, worktree changes, and proposal updates. Users pay for context they never read.

This proposal makes cost **transparent** (S2), the cache **warm by default** (S6), and the system prompt **right-sized** (S3 / S4 / S5). The expected outcome: a default mcp-vertex session costs ≤ $0.10/hour on the Go tier for a typical 50-turn workflow, down from the current ~$1.26/hour.

## why

A 2026-06-28 audit of a 30-min session showed $0.63 of API spend for ~50 tool calls. The largest single cost (33k input, 3k output = $0.067) was explained entirely by a cache miss. The "Go" tier loses its cheap-tier advantage when the cache misses 30%+ of turns — and mcp-vertex's default config breaks the cache every time a tool returns, a worktree switches, or a proposal updates.

mcp-vertex has the pieces to fix this: `mcp-vertex_metrics` (S2), `--preset` registry (S4), `compact: true` on `mcp-vertex_overview` (S5), `cacheControl: { type: 'ephemeral' }` (S1), and the host extension's `activate()` hook (S6). They just aren't wired. The fix is orchestration-level, not a per-tool patch.

## non-goals

- Per-byte LRU/LFU cache (over-engineering for a 1-2 MB system prompt).
- Migrating non-Anthropic / non-OpenAI providers (cache_control is provider-specific).
- Eliminating the catalog from the prompt (it is the load-bearing discovery contract).
- Forcing `--preset=lean` on existing users (opt-in, like `--preset=swarm`).

## architecture

Six parallel slices, all file-disjoint. **S1** is the foundation (cache headers). **S2** surfaces the cost. **S3 / S4 / S5** reduce it. **S6** ensures the first turn of every session hits the cache.

- **S1 — Cache control headers in providers** (anthropic.ts, openai.ts)
- **S2 — `mcp-vertex_cache_metrics` tool** (new tool + registry)
- **S3 — System prompt size lint** (`bun run lint:prompt-size`)
- **S4 — `--preset=lean`** (4 of 16 plugins, doc page)
- **S5 — Compact-by-default** for `mcp-vertex_overview` and `proposals_auto_work`
- **S6 — Cache warm-up on VS Code session start** (host `activate()`)

S2, S3, S4, S5 are all claimable in parallel. S6 depends on S1 (warm-up requires cache headers in place). S1 is the foundation; close it first.

## slices

### S1 — Cache control headers in providers
- **Status**: pending
- **Files**: [packages/core/src/lib/providers/cache-control.ts, packages/core/src/lib/providers/anthropic.ts, packages/core/src/lib/providers/openai.ts]
- **Gate**: bun run typecheck
- **Expect**: exit0

### S2 — mcp-vertex_cache_metrics tool for per-turn cost visibility
- **Status**: pending
- **Files**: [packages/core/src/lib/tools/cache-metrics-tool.ts, packages/core/src/lib/tools/registry.ts]
- **Gate**: bun run typecheck
- **Expect**: exit0

### S3 — System prompt size lint
- **Status**: pending
- **Files**: [tools/scripts/lint/system-prompt-size.script.ts, tools/scripts/lint/index.ts, package.json]
- **Gate**: bun run lint:prompt-size
- **Expect**: exit0

### S4 — Lean preset (4 essential plugins only) + docs page
- **Status**: pending
- **Files**: [packages/core/src/lib/presets/lean.preset.ts, packages/core/src/lib/presets/registry.ts, apps/web/src/pages/docs/presets/lean.astro]
- **Gate**: bun run typecheck
- **Expect**: exit0

### S5 — Compact-by-default for mcp-vertex_overview and proposals_auto_work
- **Status**: pending
- **Files**: [packages/core/src/lib/tools/overview-tool.ts, packages/core/src/lib/tools/auto-work-tool.ts]
- **Gate**: bun run typecheck
- **Expect**: exit0

### S6 — Cache warm-up on VS Code session start
- **Status**: pending
- **Files**: [extensions/vscode/src/services/cache-warm.ts, extensions/vscode/src/extension.ts]
- **Gate**: bun run typecheck
- **Expect**: exit0

## acceptance

- `bun run typecheck` exits 0
- `bun run lint:tools` exits 0
- `bun run lint:prompt-size` exits 0
- `bun run validate` exits 0
