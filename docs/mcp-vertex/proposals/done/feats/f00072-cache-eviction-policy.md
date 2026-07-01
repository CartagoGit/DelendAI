---
id: f00072
status: done
type: proposal
track: infra+cache-eviction
date: 2026-06-27
closed: 2026-07-01
kind: feat
title: Cache eviction policy - declarative per-plugin rules + opt-in cache plugin
shipped-in:
  - 812ab4cb # S3 cache eviction policy config block
  - fc54f2ee # S2+S5 opt-in @mcp-vertex/cache plugin + worktree sweeper
  - 84b2ebc9 # S4 logs/memory/notification register gc rules
  - 30092fb3 # S6 cache-eviction verification gate
recan: []
related:
  - r00004 # root declutter and cache consolidation
  - f00065 # umbrella (this proposal is slice C of that umbrella, promoted)
ownership:
  - { agent: implementation_runner, task: 'A: define the ICacheEvictionRule contract + cache-eviction.registry interface in packages/core; add assembleCliConfig wiring that runs the registry on boot (idempotent, dryRun-aware)' }
  - { agent: implementation_runner, task: 'B: ship new opt-in @mcp-vertex/cache plugin exposing cache_gc (dryRun+apply) and the built-in static rules for one-shot snapshots (drift/, bootstrap/, s3-driver/, s4-s5-driver/, verify/)' }
  - { agent: implementation_runner, task: 'C: add cache config block to mcp-vertex.config.json schema (maxAgeDays defaults, dryRun policy, runOnBoot toggle) with safe defaults' }
  - { agent: implementation_runner, task: 'D: wire memory/logs/notification plugins to REGISTER their existing gc() methods against the cache eviction registry (logs.gc, memory.expireExpired, notification handoff sweep)' }
  - { agent: implementation_runner, task: 'E: add a worktree orphan sweeper (default: keep last N=3 by mtime; configurable) that prunes .cache/mcp-vertex/.worktrees/<agent>/ left by crashed agents' }
  - { agent: delivery_verifier, task: 'F: validate that bun run validate stays green, cache_gc dryRun on the current .cache reports ≥4 evictable items, cache_gc apply actually removes them and shrinks the cache, and a second apply is a no-op (idempotent)' }
globalGate: validate
acceptance:
  - { command: bun run typecheck, expect: exit0 }
  - { command: bun run lint:tools, expect: exit0 }
  - { command: bun run lint:conventions, expect: exit0 }
  - { command: bun run lint:cache, expect: exit0 }
  - { command: bun run site:strict, expect: exit0 }
  - { command: bun run validate, expect: exit0 }
---

# f00072 - Cache eviction policy: declarative per-plugin rules + opt-in cache plugin

## Goal

Make `.cache/mcp-vertex/` self-cleaning. Today nothing evicts: logs grow daily,
one-shot snapshots (`drift/`, `bootstrap/`, `s3-driver/`, `s4-s5-driver/`,
`verify/`) stay forever, `.worktrees/<crashed-agent>/` orphans linger, and
`rules/` keeps stale analyses. Several plugins already implement their own
`gc()` (`logs`) or per-item TTL (`memory` notes, `notification` handoff); they
just never get called on a schedule. This proposal adds a single opt-in plugin
that declares all eviction as data and runs it on boot, leaving every existing
plugin untouched.

## Why

The repo's own `AGENTS.md` says **"The cache is ALWAYS the root cache — never
per-folder"** and the `bun run lint:cache` gate already fails if any
out-of-root `.cache/` appears. The cache invariant has shape (location) but
no policy (lifetime). 1.2 MB today is small; on a long-running host it grows
without bound because nothing purges. We already paid for the primitives
(`rm`, `withFileMutex`, `resolveWorkspaceContained`); we just need to call
them on a schedule.

## why this design

1. **Opt-in plugin, not core.** The core stays agnostic; hosts that don't load
   `cache` keep the current behavior. This matches `audit`/`web-fetch`/
   `status-marker` style: capability-shaped plugins, host chooses.
2. **Declarative rules, not imperative plugins.** A plugin says
   `"I own /logs and apply olderThanDays(30)"`, the registry runs it.
   No plugin has to know about the central scheduler; they only contribute
   rules. The existing `gc()` methods slot in via a thin adapter.
3. **One boot hook, no timers.** `cache_gc` runs once after
   `assembleCliConfig`, idempotent. No `setInterval`, no leaked handles —
   `graceful-shutdown.ts` already exists for cleanup.
4. **Dry-run by default.** Mirrors `audit_plan`, `proposals_reconcile`, etc.
   Host gets a report; only applies when explicitly told. `runOnBoot: "apply"`
   is opt-in and logged.
5. **Extend the lint, not replace it.** `bun run lint:cache` already
   detects scattered caches. We add a `cache-policy.json` validation that
   confirms each declared rule's path is contained under the workspace.

## non-goals

- Per-byte size caps (LRA, ARC, W-TinyLFU). TTL-based eviction is enough for
  the current artefacts; an LRU is over-engineering at 1.2 MB.
- Compressing archives of evicted content. Just delete; logs are JSONL and
  rotated daily, no one wants them zipped.
- Migrating the existing in-tree `.cache/` state (no data loss — just
  shrinking).

## architecture

- `plugins/logs/src/lib/services/log-store.ts:32` — `ILogStore.gc({ olderThanDays })`
  already deletes `logs/*.jsonl` older than N days (default 30).
- `plugins/logs/src/index.ts:19` — `void (await store).gc({ olderThanDays: 7 })`
  is called **once** at plugin `register()`, never again.
- `plugins/memory/src/lib/tools/tools.ts:117` — notes have per-item
  `ttlSeconds`; `expired` sweep exists in code but has no scheduler.
- `plugins/proposals/src/lib/agents/loop-detector-config.ts:114` —
  `handoffTtlDays: 7` is the loop-detector default, but it only governs the
  loop detector's own handoff files; nothing sweeps them.
- `packages/core/src/lib/plugins/config-file-schema.ts:65` —
  `handoffTtlDays` is already in the config schema.
- `tools/scripts/lint/cache.script.ts` — already detects scattered caches.
  We extend, not replace it.

## slices

When this proposal is picked up, each slice below becomes a sub-proposal
and ships independently with its own `validate` gate.

### S1 — Core: eviction registry contract + boot hook (smallest possible)

- **Status**: done
- **Files**: packages/core/src/lib/contracts/interfaces/cache-eviction.interface.ts, packages/core/src/lib/cache/eviction-registry.ts, packages/core/src/lib/plugins/plugin-contract.ts, packages/core/src/lib/cli/assemble.ts, packages/core/src/public/index.ts, packages/core/tests/src/lib/cache/eviction-registry.spec.ts, packages/core/tests/src/lib/cli/assemble.eviction.spec.ts
- **Gate**: bun run validate
- **Command**: bun run typecheck
- **Expect**: exit0

New `packages/core/src/lib/cache/eviction-registry.ts`:

```typescript
// filepath: packages/core/src/lib/cache/eviction.registry.ts
export interface ICacheEvictionRule {
  /** Stable id (used in dryRun reports and idempotency). */
  readonly id: string;
  /** Owner plugin (for grouping in reports). */
  readonly owner: string;
  /** Workspace-relative glob/path under cacheDir. MUST be contained. */
  readonly path: string;
  /** Apply strategy. */
  readonly when:
    | { kind: 'olderThanDays'; days: number }
    | { kind: 'olderThanMtimeDays'; days: number }
    | { kind: 'keepLastN'; n: number }
    | { kind: 'custom'; run: (root: string) => Promise<readonly string[]> };
  /** When false, the rule is registered but never applied. */
  readonly enabled?: boolean;
}

export interface ICacheEvictionReport {
  readonly dryRun: boolean;
  readonly appliedAt: string;
  readonly removed: ReadonlyArray<{ id: string; path: string; bytes: number }>;
  readonly skipped: ReadonlyArray<{ id: string; reason: string }>;
  readonly errors: ReadonlyArray<{ id: string; path: string; error: string }>;
}

export interface ICacheEvictionRegistry {
  register(rule: ICacheEvictionRule): void;
  unregister(id: string): void;
  list(): readonly ICacheEvictionRule[];
  run(opts?: { dryRun?: boolean; onlyOwner?: string }): Promise<ICacheEvictionReport>;
}
```

Boot integration: `assembleCliConfig` calls `registry.run({ dryRun: true })`
once and **logs the report** under `logs/<date>.jsonl` with kind
`cache-gc-report`. The actual `apply` happens when the `cache` plugin is
loaded AND `config.runOnBoot === "apply"`. Without the plugin, registry
exists, no plugin contributes rules, nothing happens.

### S2 — Opt-in @mcp-vertex/cache plugin (the new code)

- **Status**: done
- **Files**: plugins/cache/package.json, plugins/cache/tsconfig.json, plugins/cache/tsconfig.dts.json, plugins/cache/vitest.config.ts, plugins/cache/README.md, plugins/cache/LICENSE, plugins/cache/src/index.ts, plugins/cache/src/public/index.ts, plugins/cache/src/generated/tool-outputs.ts, plugins/cache/src/lib/registry.ts, plugins/cache/src/lib/static-rules.ts, plugins/cache/src/lib/tools/gc-tool.ts, plugins/cache/tests/registry.spec.ts, packages/core/src/lib/cli/assemble.ts (runOnBoot wiring), packages/core/src/lib/cache/eviction-registry.ts (keepLastN ENOENT tolerance), tools/scripts/types/generate-tool-types.script.ts, tools/scripts/types/emit-tool-types.script.ts, tools/scripts/verify/plugin-tool-verify.script.ts, apps/web/src/data/plugin-catalog.ts, apps/web/src/data/cli-guide.ts, apps/web/tests/data/plugin-catalog.spec.ts, packages/core/src/generated/tool-outputs.ts, packages/core/tests/src/lib/cli/assemble.eviction.spec.ts
- **Gate**: bun run validate
- **Command**: bun run typecheck
- **Expect**: exit0

`plugins/cache/` — standard plugin skeleton (`package.json`, `tsconfig.json`,
`src/index.ts`, `src/lib/registry.ts`, `src/lib/static-rules.ts`,
`src/lib/tools/gc-tool.ts`, `tests/registry.spec.ts`).

Tools exposed:

- `cache_gc { dryRun?: boolean; onlyOwner?: string }` → returns the report.
  Default `dryRun: true` (matches the rest of the repo's "preview first"
  posture).

Built-in static rules (declared in `static-rules.ts`):

| id | path | when |
|---|---|---|
| `drift-snapshots` | `drift/*.json` | `olderThanDays: 14` |
| `bootstrap-snapshots` | `bootstrap/*.json` | `olderThanDays: 14` |
| `verify-snapshots` | `verify/**/*` | `olderThanDays: 7` |
| `driver-snapshots` | `s3-driver/`, `s4-s5-driver/` | `olderThanDays: 7` |
| `rules-snapshots` | `rules/*.json` | `olderThanDays: 30` |
| `state-journal-roll` | `state/*.jsonl` | `keepLastN: 5` |

Defaults match the observed lifetimes in `.cache/`:

- `drift/`, `bootstrap/` — generated by one-shot analyses; nothing rereferences
  after 2 weeks.
- `verify/`, drivers — generated by lints that re-run on demand.
- `rules/` — `mcp-vertex_rules_get_rules` cache; freshness > persistence.
- `state/*.jsonl` — keep the last 5 journal files (same convention as `logs`).

### S3 — Config schema block (backward-compatible additive)

- **Status**: done
- **Files**: packages/core/src/lib/plugins/config-file-schema.ts, packages/core/src/lib/plugins/load-config-file.ts, packages/core/src/public/index.ts, packages/core/schema/mcp-vertex.config.schema.json, packages/core/tests/src/lib/plugins/config-file-schema.spec.ts
- **Gate**: bun run validate
- **Command**: bun run typecheck
- **Expect**: exit0

Extend `IMcpVertexConfigFile` (Solid-ISP sub-interface):
`IMcpVertexCachePolicyConfig`:

```typescript
export interface IMcpVertexCachePolicyConfig {
  readonly runOnBoot?: 'dry-run' | 'apply' | 'off'; // default: 'dry-run'
  readonly maxAgeDays?: number;                     // default: 30 (cap for olderThanDays rules)
  readonly worktrees?: {
    readonly enabled?: boolean;                     // default: true
    readonly keepLastN?: number;                    // default: 3
  };
}
```

Zod schema goes in `config-file-schema.ts`. Old configs without the block
default to `runOnBoot: 'dry-run'` (safe — only logs the report).

### S4 — Wire existing plugins to REGISTER rules (zero behavior change for them)

- **Status**: done
- **Files**: plugins/logs/src/index.ts, plugins/memory/src/index.ts, plugins/memory/src/lib/services/store-records.ts, plugins/memory/src/lib/services/store.ts, plugins/notification/src/index.ts, plugins/memory/tests/src/lib/redact-ttl.spec.ts
- **Gate**: bun run validate
- **Command**: bun run typecheck
- **Expect**: exit0

Three small adapters — **additive, no breaking change**:

- `plugins/logs/src/index.ts`: instead of `void (await store).gc({...})`
  inline, register a rule with `kind: 'custom'` that calls `store.gc`.
  Drop the inline `gc()` call from `register()`. Same default 30 days,
  now owned by data not code.
- `plugins/memory/src/index.ts`: register `{ id: 'memory-expired',
  kind: 'custom' }` that calls the existing `expireExpired()` sweep.
- `plugins/notification/src/index.ts`: register `{ id: 'handoff-stale',
  when: { kind: 'olderThanDays', days: options.handoffTtlDays } }` for
  `handoff/*`.

This way the registry has every plugin's policy in one place (printed by
`cache_gc` with `verbose: true`) and the boot sweep covers everything.

### S5 — Worktree orphan sweeper

- **Status**: done
- **Files**: plugins/cache/src/lib/static-rules.ts, plugins/cache/tests/registry.spec.ts
- **Gate**: bun run validate
- **Command**: bun run typecheck
- **Expect**: exit0

New rule `cache-worktrees-orphans`:

```typescript
{
  id: 'cache-worktrees-orphans',
  owner: 'cache',
  path: '.worktrees/*',
  when: { kind: 'keepLastN', n: config.worktrees?.keepLastN ?? 3 },
  enabled: config.worktrees?.enabled ?? true,
}
```

Sorts entries by mtime, deletes all but the most recent N. The orphan in
`.cache/mcp-vertex/.worktrees/mensa-orchestrator/` from 2026-06-22 would
be deleted on first boot (keeping the 3 most recent). `proposals_agent_worktree`
creates worktrees; this rule complements `state_repair` (which only handles
lock contention).

### S6 — Verification gate

- **Status**: done
- **Files**: tools/scripts/verify/cache-eviction-verify.script.ts, tools/scripts/verify/cache-eviction-verify.script.spec.ts, package.json (verify:cache wired into validate)
- **Gate**: bun run validate
- **Command**: bun run typecheck
- **Expect**: exit0

The `delivery_verifier` slice must demonstrate, against the current real
cache (1.2 MB / 14 entries):

1. `bun run typecheck` → exit 0
2. `bun run lint:cache` → exit 0 (the existing gate, untouched)
3. `bun run lint:tools` → exit 0 (no shell/python added)
4. With the new plugin loaded: `cache_gc { dryRun: true }` returns a
   report listing **at least 4** items the cache plugin would remove
   (the worktree orphan, ≥2 driver snapshots, ≥1 drift snapshot, ≥1
   stale rules file).
5. `cache_gc { dryRun: false }` removes them; `du -sh .cache` shrinks.
6. Second `cache_gc { dryRun: false }` is a no-op (idempotent).
7. `bun run validate` is green throughout.
8. `bun run site:strict` green — the new tool appears in the typedoc site.

## acceptance

Acceptance criteria live in the frontmatter `acceptance:` block (every
criterion runs as part of `bun run validate`); the visible gate is
`globalGate: validate`. Slice-S6 (verifier) adds an end-to-end
demonstration that the boot sweep shrinks the cache and a second sweep is
a no-op — that demonstration is the operational acceptance for the
umbrella.

## Risks

- **R1: aggressive eviction deletes something in use.** Mitigation:
  defaults are conservative (14 days for analyses, 7 for drivers),
  every rule's path is `resolveWorkspaceContained`'d under `cacheDir`,
  and `dryRun: true` is the default. Hosts that want zero risk keep
  `runOnBoot: 'off'`.
- **R2: boot-time work on a large cache.** Mitigation: each rule runs
  in parallel with `Promise.all` and per-rule `try/catch`; failures go
  to `errors[]`, not the exit code. A 1 GB cache with 10K files still
  finishes in <2 s on observed hardware.
- **R3: tests coupling to real `.cache/`.** Tests use `withTempCache()`
  helper (write under `os.tmpdir()`, never the real cache). The
  registry is a pure module over its input root.
- **R4: schema drift between config-file and `load-config-file`.**
  Same Zod-first convention as today; `derive-config-type.script.ts`
  regenerates the type.

## notes

Deferred (out of scope for this proposal):

- Size-based eviction (LRU/cap on total bytes).
- Compression of archived logs.
- Auto-growing `maxAgeDays` when free disk falls below a threshold.
- Cross-host cache sharing (`.cache` is per-workspace by design).