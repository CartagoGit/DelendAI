---
id: f00086
status: done
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
- **Note (2026-07-01, drain)**: NOT IMPLEMENTABLE as written. mcp-vertex is an
  MCP *server* library, not an LLM client — it has no provider layer
  (`packages/core/src/lib/providers/` does not exist and never did). The model,
  and therefore the `cache_control` request headers, belong to the HOST
  (Copilot / Claude Code), not to mcp-vertex. The only Anthropic/OpenAI client
  in the tree is `plugins/audit/src/lib/services/llm-client.service.ts`, which
  is x00091 territory and out of scope (and does not set `cache_control`).
  This slice is a category error for this repo; kept `pending`, not closed.
  mcp-vertex's real cost lever is the *size of the tool payloads and static
  system prompt it emits* — addressed by S3 (new) and S2/S5 (already shipped).

### S2 — mcp-vertex_cache_metrics tool for per-turn cost visibility
- **Status**: done (superseded — already shipped before this proposal)
- **Files**: [packages/core/src/lib/tools/cache-metrics-tool.ts, packages/core/src/lib/tools/registry.ts]
- **Gate**: bun run typecheck
- **Expect**: exit0
- **Note (2026-07-01, drain)**: Per-turn cost visibility already exists as the
  `mcp-vertex_metrics` tool — `packages/core/src/lib/metrics/metrics-tool.ts`
  reports per-tool `calls / errors / latency / totalBytes` plus totals, with
  `persist:true` snapshots under `<cacheDir>/metrics/` for longitudinal
  comparison. `totalBytes` IS the per-turn payload cost this slice asked for.
  It is wired in `packages/core/src/lib/cli/assemble.ts:635`. No separate
  `cache_metrics` tool is warranted; adding one would duplicate the surface.
  Marked done/superseded rather than implemented.

### S3 — System prompt size lint
- **Status**: done
- **Files**: [tools/scripts/lint/system-prompt-size.script.ts, tools/scripts/lint/system-prompt-size.script.spec.ts, package.json]
- **Gate**: bun run lint:prompt-size
- **Expect**: exit0
- **Note (2026-07-01, drain)**: Implemented. `tools/scripts/lint/index.ts`
  does not exist in this repo (lint scripts are registered as individual
  `package.json#scripts` keys, not an index barrel), so the spec sits next to
  the script (`*.script.spec.ts`, the house convention) instead. The lint
  imposes a per-file UTF-8 byte budget on the four static "system prompt"
  files that every host loads on cold start: `AGENTS.md`, `CLAUDE.md`,
  `.github/copilot-instructions.md`, and `docs/mcp-vertex/AGENT-BOOTSTRAP.md`
  (the bootstrap they all link to). It is complementary to — not a duplicate
  of — the f00084 `host-instructions` content lint (no size rule) and the N23
  `token-budget.e2e.spec.ts` runtime payload benchmark (no static-file rule).
  Budgets carry the measured baseline with ~10% headroom; growth needs a dated
  rationale bump. Wired as `lint:prompt-size` and into the `validate` chain.
  Committed 8d9ee26c/e8e41baa.

### S4 — Lean preset (4 essential plugins only) + docs page
- **Status**: done
- **Files**: [packages/core/src/lib/plugins/preset-catalog.ts, packages/core/src/lib/plugins/preset-catalog.spec.ts, packages/core/tests/src/lib/plugins/preset-catalog.spec.ts, tools/scripts/lint/no-preset-drift.script.ts, packages/cli/src/lib/init/init-prompts.service.ts, apps/web/scripts/__tests__/preset-table.spec.ts]
- **Gate**: bun run validate
- **Expect**: exit0
- **Note (2026-07-02, landed)**: Implemented as an **independent** preset named
  `lean` in `packages/core/src/lib/plugins/preset-catalog.ts` (NOT the stale
  `presets/registry.ts`). Members are EXACTLY the 4 essentials, in order:
  `git, search, memory, docs` — version control, code discovery, cross-session
  continuity, documentation; nothing heavy. Placed in `PRESET_KIND` right after
  `minimal` (`[minimal, lean, standard, swarm, full, vertex]`) with the catalog
  entry in the same slot, marked `independent: true` so
  `resolvePresetMembers('lean')` resolves to EXACTLY those 4 and never
  accumulates the chain. Because it is independent it does NOT change the
  resolved membership of `standard`/`swarm`/`full` (locked by spec). Ripple
  updates: the `no-preset-drift` lint (`lint:setup`) `PRESET_KIND` +
  `PRESET_MEMBERSHIPS` mirror; the init UI preset menu
  (`init-prompts.service.ts`) — the `init` enum derives from `PRESET_KIND` so
  `lean` is accepted automatically, matching how `vertex` is handled (no
  special-casing). The web `/presets` table is DERIVED from `PRESET_CATALOG`
  (title/summary read straight from the catalog), so no per-preset i18n keys
  exist to add — only the derived-table spec row list was extended. The docs
  page (`presets/lean.astro`) proposed in the stale Files list is unnecessary:
  the single `/presets` page renders every catalog preset, including `lean`,
  automatically. All other f00086 slices are already done/superseded except
  S1/S6 (cache-header slices held `pending` as category errors), so the
  proposal cannot yet be closed; file left in `ready/`.

### S5 — Compact-by-default for mcp-vertex_overview and proposals_auto_work
- **Status**: done (superseded — compact paths already ship; default-flip declined)
- **Files**: [packages/core/src/lib/tools/overview-tool.ts, packages/core/src/lib/tools/auto-work-tool.ts]
- **Gate**: bun run typecheck
- **Expect**: exit0
- **Note (2026-07-01, drain)**: The compact surfaces already exist.
  `packages/core/src/lib/tools/overview-tool.ts` supports `compact:true`
  (names-only, ~25% of the full payload) and `auto_work`
  (`plugins/proposals/src/lib/tools/auto-work.tool.ts`) already returns a
  tight, low-token action list by design (its description says "Low-token: a
  tight action list, not prose"). Both are pinned by the N23 e2e
  `token-budget.e2e.spec.ts` (overviewCompact < 2100B and `compact < full*0.7`;
  autoWork < 1600B). Making `compact` the DEFAULT (i.e. changing the no-arg
  return) is NOT done here: it would flip the documented `overviewFull`
  baseline the e2e asserts and change a stable public contract many callers
  rely on for the full map — a behavior change out of proportion to the token
  win now that `compact:true` is one keystroke away and already the documented
  recommendation. Marked done/superseded (compact shipped); default-flip
  declined with rationale rather than left dangling.

### S6 — Cache warm-up on VS Code session start
- **Status**: pending
- **Files**: [extensions/vscode/src/services/cache-warm.ts, extensions/vscode/src/extension.ts]
- **Gate**: bun run typecheck
- **Expect**: exit0
- **Note (2026-07-01, drain)**: Blocked on S1. "Warm the cache on session
  start" presupposes S1's provider `cache_control` headers, which are a
  category error for this repo (mcp-vertex has no LLM provider — the model is
  the host; see S1 note). The VS Code extension (`extensions/vscode/`) drives
  the MCP server, it does not make model requests, so there is no request cache
  for it to warm. Kept `pending`, not closed, pending a reframing of S1.

## acceptance

- `bun run typecheck` exits 0
- `bun run lint:tools` exits 0
- `bun run lint:prompt-size` exits 0
- `bun run validate` exits 0
