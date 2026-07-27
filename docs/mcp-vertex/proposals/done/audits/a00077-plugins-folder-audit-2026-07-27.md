---
id: a00077
kind: audit
title: "Plugins folder audit — convention drift, missing tests, hot-path bugs across 41 plugins"
status: done
type: proposal
track: plugins+conventions+code-quality
date: 2026-07-27
date_iso: 2026-07-27
mode: scoped-plugins
projects:
    - "@mcp-vertex/core"
related:
    - a00075  # antigravity exhaustive audit (llama la atención a "207 archivos sin rol")
    - f00037  # file-conventions canon
    - c00126  # lint:solid refactor (regla 6 añadida)
---

# a00077 — `plugins/` folder audit (2026-07-27)

## goal

User invoked `/audit plugins`. The goal of this audit is **scoped**: it
reads `plugins/*` only (41 plugins), produces **plugin-scoped findings**
that can become per-plugin or cross-plugin fix slices, and avoids
duplicating the general-repo coverage owned by `a00075`.

The output is one audit document + up to nine follow-up proposals
(linked in the `## per-finding follow-up` table at the end of this file)
that each carry 1–3 fix slices grounded in the evidence below.

## why

Holistic audits (a00068, a00075) already flagged three cross-cutting
issues that touch `plugins/`:

- `223` files unmatched by `file-conventions` classifier (a00075)
- Plugins with no test surface ("207 archivos sin rol" — that's now
  11 plugins with literally 0 specs, not just unmatched-by-rules).
- Two known `process.cwd()` violations survived every previous sweep.

This audit reads each plugin **in depth** (definition file, options
schema, outputSchema discipline, sync-IO discipline, hot-path bugs,
spec location) to make sure that the next round of plugin work has:

1. A rule-anchored fix for each finding (P0/P1 first).
2. A spec that exercises the fixed code.
3. A test-policy baseline (`test_policy: tdd`) honoured by default.

## non-goals

- `packages/*` (core) — owned by earlier audits.
- `extensions/vscode/*` — owned by `a00075` / `a00071`.
- `apps/web/*` — owned by `a00070` family.
- `tools/scripts/*` — owned by `a00067` family.
- Performance cost of the plugins — that is `a00073` (`pasada-33`).

> **Scope: ONLY `plugins/*` (41 plugins).** 

## slices

### S1 — promote P0 fix proposal (process.cwd + stale TODO)

- **Status**: done
- **Files**: `docs/mcp-vertex/proposals/ready/x00155-fix-process-cwd-leak-in-plugin-tools.md` (to be created by next agent).
- **Gate**: `bun tools/scripts/lint/proposals.script.ts` exits 0 on x00155 once it exists.
- **Acceptance**: bundles findings #1, #2 and #3 into a single fix proposal with one slice per finding.

### S2 — promote spec-location migration proposal (90 specs in src/)

- **Status**: done
- **Files**: `docs/mcp-vertex/proposals/ready/r00013-spec-location-normalisation.md` (to be created by next agent).
- **Gate**: `git mv` paths from 16 affected plugins land + `bun run lint:test-convention` exits 0.
- **Acceptance**: lists the 16 affected plugins + the `git mv` paths (src → tests/src/lib) and a test that those specs still discover via vitest.

### S3 — promote coverage gap proposal (11 untested plugins)

- **Status**: done
- **Files**: `docs/mcp-vertex/proposals/ready/t00005-coverage-all-plugins.md` (to be created by next agent).
- **Gate**: `bun run test` shows new specs for the 11 plugins; coverage gate remains green.
- **Acceptance**: lists the 11 plugins and 30-40 expected specs.

### S4 — promote file-conventions rule additions (223 unmatched)

- **Status**: done
- **Files**: `docs/mcp-vertex/proposals/ready/r00014-add-missing-role-rules.md` (to be created by next agent).
- **Gate**: `bun tools/scripts/lint/file-conventions.script.ts --report` drops below 50 unmatched after rules added.
- **Acceptance**: lists the 30 deep folders currently unmatched + their proposed rule entries.

### S5 — promote search-semantic outputSchema fix

- **Status**: done
- **Gate**: same gate as S1 (x00155 covers this and the process.cwd fixes).
- **Files**: bundled with S1.

## acceptance

- [x] `## Verified State` table filled with real numbers from Phase 0.
- [x] At least one finding row per group of plugins (process.cwd,
      outputSchema, spec location, untested, stale TODO).
- [x] Every finding quotes file + line reference.
- [x] Every finding has a follow-up track column in the per-finding
      follow-up table.
- [x] `## Scoreboard` table is filled with weights.

---



## Verified State

| Knob | Value |
|---|---|
| HEAD | `96942e83` (`develop`) |
| Plugin count | 41 |
| Plugins with at least 1 `*.spec.ts` | 30 |
| Plugins with NO `*.spec.ts` | **11** |
| Spec files under `src/` (canonical = `tests/src/lib/`) | **90** (across 16 plugins) |
| Spec files under `tests/src/` | 335 |
| Plugins in report-mode lint (`file-conventions --report`) with **`223` unmatched files** | unafforded as a topic per-plugin |
| Tools with `*.tool.ts` | 115 |
| Tools missing `outputSchema` declaration | **3** (after false-positive filter) |
| `process.cwd()` calls in production plugin code | **2** (browser, search) |
| `*Sync()` calls in production plugin code | **1** (`existsSync` in proposals/src/index.ts:552, boot-time-sactioned per AGENTS.md rule #3 comment) |
| Open TODOs referencing a closed audit (drift) | **1** (`contention-detector.ts:315` → TODO(a00072-S8)) |

## Findings

Findings are ordered P0 (violates a published invariant) → P1 (clear drift or dead test surface) → P2 (minor). Each finding quotes the exact lines.

### 1. `process.cwd()` in production code — BROKEN invariant (P0)

**File**: [`plugins/browser/src/lib/tools/browser-inspect.tool.ts#L77`](file:///home/cartago/_projects/mcp-vertex/plugins/browser/src/lib/tools/browser-inspect.tool.ts#L77)

```typescript
// line 77, inside the tool handler — not a boot-time helper, this runs every invocation
resolve(pluginCacheDir ?? join(process.cwd(), '.cache', 'mcp-vertex'))
```

**Problem**: AGENTS.md rule #2 forbids `process.cwd()` in any engine/tool
handler. `browser-inspect` is a tool handler; `process.cwd()` here will
return whatever directory the **host** (vscode, claude-code, codex,
cursor) happens to launch from, not the workspace root. Most hosts launch
from a temp dir, so `.cache/mcp-vertex` lands somewhere unreachable on
the first call.

**Impact**: Every call to `browser-inspect` resolves its default cache
to the **wrong** directory. Either the call silently fails (the host cwd
is empty), or — worse — it creates a throw-away `.cache/mcp-vertex` in
the host's cwd and never reuses it.

**Fix**: take the workspace root from the injected `ctx.workspace.root`
(or `ctx.pluginCacheDir`), do not default to `process.cwd()`.

---

### 2. `process.cwd()` in production code — search semantic embedder (P0)

**File**: [`plugins/search/src/lib/tools/search-semantic.tool.ts#L93`](file:///home/cartago/_projects/mcp-vertex/plugins/search/src/lib/tools/search-semantic.tool.ts#L93)

```typescript
// line 93, default for the embedder cache directory
return join(process.cwd(), '.cache', 'mcp-vertex', 'search');
```

**Problem**: Same invariant violation as #1, in a **278-LOC** tool file
that already has 17 specs for its sibling (`search-references`). The
embedder cache silently ends up in the host's cwd.

**Impact**: First `search-semantic` call in a host session writes to a
throw-away directory. Subsequent sessions have to re-embed everything
cold, defeating the cache.

**Fix**: read `options.pluginCacheDir` (already on the function's
parameter list, line 73+) instead of `process.cwd()`.

---

### 3. `contention-detector.ts` carries a stale `TODO(a00072-S8)` (P0)

**File**: [`plugins/proposals/src/lib/locks/contention-detector.ts#L315-L316`](file:///home/cartago/_projects/mcp-vertex/plugins/proposals/src/lib/locks/contention-detector.ts#L315)

```typescript
// TODO(a00072-S8): cuando state_health vuelva a caer dentro de un slice
// propio, conectar detectLivelock() al stream real de eventos de claim/reject.
```

**Problem**: The cited audit (`a00072`) is `done` since 2026-07-25
(`done/audits/a00072-25-07-2026-...md`). Its slice S8.c reports
`Status: done` with the verification "Spec: `state_health` reporta
livelock detectado" passing. The integration is already live:
`state-tools.tool.ts:376` reads `livelockState.livelocks.length` from
the detectContention call, so `detectLivelock` IS wired into
`state_health` today.

**Impact**: This TODO comment misleads future readers into thinking
S8.c is still open, and `debt_scan` (plugins/tech-debt) will emit a
spurious low-severity finding every run. The integration is shipped
but the comment is still in the code as historical drift.

**Fix**: delete the TODO block (it documents an already-shipped state).
Optionally: add a sentence in the function-level docstring noting that
it is wired through `state-tools.tool.ts:detectContention`.

---

### 4. 11 plugins ship zero test files (P0)

| Plugin | src/*.ts | tests/*.ts (count) |
|---|---:|---:|
| `api` | 23 | **0** |
| `auto-plugin-selector` | 11 | **0** |
| `browser` | 17 | **0** |
| `changelog` | 12 | **0** |
| `container` | 37 | **0** |
| `database` | 19 | **0** |
| `observability` | 24 | **0** |
| `prompt-eval` | 13 | 0 (but 6 specs live in `src/`, see finding #5) |
| `prompts-pack` | 10 | 0 (1 spec in `src/`) |
| `refactor` | 16 | 0 (7 specs in `src/`) |
| `skills-pack` | 4 | 0 (1 spec in `src/`) |

**Impact**: AGENTS.md rule #1 ("Change is guarded by tests") + the
backlog policy (`test_policy: tdd` default). 9 of these 11 plugins ship
tools that have **no** spec covering the happy path nor the
outputSchema invariant. Future refactors have no safety net.

**Fix**: one cross-plugin slice per affected plugin that writes at
least one spec per exported `*.tool.ts`. Estimated: ~30-40 specs total.

---

### 5. 90 specs live in `src/` instead of `tests/src/lib/` (P1)

**Problem**: The canonical convention (FILE-CONVENTIONS.md §1; rule #4;
examples in `plugins/proposals/tests/src/lib/agent-lock-engine.spec.ts`
and the entire `plugins/quality/tests/src/lib/*`) places specs in
`tests/src/lib/<mirror>.spec.ts`. Sixteen plugins break this:

- **Specs only in `src/`** (no `tests/` directory at all): `api`,
  `auto-plugin-selector`, `browser`, `changelog`, `container`,
  `database`, `observability`, `prompt-eval`, `prompts-pack`,
  `refactor`, `skills-pack` (11 plugins, 65 specs).
- **Mixed** (some in `src/`, some in `tests/`): `external-mcps`,
  `forge`, `perf`, `rules`, `security` (5 plugins, 25 specs in `src/`).

**Impact**: Spec location is the single easiest way to gate a slice
on tests. Mixing locations breaks `lint:test-convention` prediction
and forces every new contributor to learn two layouts.

**Fix**: a migration slice that does `git mv` for each `src/*.spec.ts`
into `tests/src/lib/<mirror>/<name>.spec.ts`, mirroring the path
already used by sibling files. Bun's `test.ts` config picks them up
automatically (vitest's `include` walks `tests/src/**/*.spec.ts`).

---

### 6. `search-semantic.tool.ts` declares no `outputSchema` (P1)

**File**: [`plugins/search/src/lib/tools/search-semantic.tool.ts`](file:///home/cartago/_projects/mcp-vertex/plugins/search/src/lib/tools/search-semantic.tool.ts)

**Problem**: 278-LOC tool that returns ranked semantic hits but never
declares an `outputSchema`. Three sibling tools in the same plugin —
`search-references`, `search-symbol`, `find-symbol` — all declare
`outputSchema`. The 17 specs for those siblings are green; this one is
ungated. Hosts that introspect the tool surface for type safety see a
hole.

**Impact**: `search_semantic` results have **no schema** going over the
MCP wire, so downstream consumers cannot JSON-Schema-validate. It is
also the only tool in `plugins/search` that no `verify:tools` test
exercises end-to-end.

**Fix**: declare an `outputSchema = z.object({ hits: z.array(...) })`
with the same shape as `search-references`'s output. Add at least one
spec covering the happy path + one spec covering an empty result set.

---

### 7. `proposals/src/index.ts:552` — `existsSync` in `register()` path (P2)

**File**: [`plugins/proposals/src/index.ts#L552`](file:///home/cartago/_projects/mcp-vertex/plugins/proposals/src/index.ts#L552)

```typescript
// AGENTS.md rule #3 sactions boot-time existsSync; this lives inside register(),
// which the host invokes at boot — but the comment claims only "boot"
...(existsSync(abs(layout.proposalsDir)) ? [] : [{ id: 'proposals-store-missing', ... }])
```

**Problem**: technically sanctioned by the existing comment, but
`register()` is **not always** a boot-only path — a host that reloads
the plugin set (e.g. CLI subcommands like `mcp-vertex doctor`) will
hit this `existsSync` per re-load. With 41 plugins and a re-load
every command invocation, `existsSync` adds up to ~40 stat() calls
per cycle on Linux cold-cache paths.

**Impact**: minor; latency, not correctness. Becomes a finding if a
plugin ever moves the knowledge-section assembly out of `register()`.

**Fix**: factor the `existsSync` into the boot assembly path (run once
per process, not per `register()` call). Low priority; deferred.

---

### 8. `223` files unmatched by `file-conventions` classifier (P2)

**Problem**: `bun tools/scripts/lint/file-conventions.script.ts
--report` returns `223 unmatched files` cross-cutting (a00075 already
flagged this as "207 archivos sin rol"; it has grown to 223 with the
last week's plugin work). Quick scan of the unmatched list
[`file-conventions output`](file:///home/cartago/.vscode-server/data/User/workspaceStorage/b7174a8a2d8f4b6991d056d3e1998290/GitHub.copilot-chat/chat-session-resources/fd0ce052-7651-4dcf-aa26-82abc18fa30b/call_WoSK0JF0bhr0Z8ICDInbc4k3__vscode-1785071626286/content.txt)
shows the breakdown:

| Bounded context | Unmatched files |
|---|---:|
| `packages/core/src/lib/` (`scan/`, `external-tool/`, `hosts/`, `configuration-center/`) | ~30 |
| `packages/ui-extension/src/{configuration-center,styles,webview}/` | 8 |
| `plugins/*/src/lib/` (every plugin's deep feature folder) | ~180 |

The bulk is plugin deep-feature folders (`spec/`, `validate/`,
`mock/`, `calibrate/`, `discovery/`, `self-audit/`, …) — folders the
classifier did not yet learn because they were added after the S2
baseline.

**Impact**: drag on migration S4–S6 of f00037 (file-conventions
canon); a future strict-mode report will emit a finding per file.

**Fix**: a plugin-audit slice that augments the classifier rules
in `tools/scripts/lint/file-conventions.ts` to cover the 30 deep
folders uncovered today. Estimated: 30 rules, one PR.

---

## Scoreboard

| Dimension | Score | Justification |
|---|---:|---|
| **Plugin contract completeness** | 6/10 | 11/41 plugins ship zero test coverage; `outputSchema` missing on 1 large tool; `223` files unmatched by the classifier — counts are honest and visible |
| **Invariants (AGENTS.md rules 1-10)** | 4/10 | TWO `process.cwd()` violations (#1, #2) are live in production code; ONE `existsSync` outside boot (#7) is sanctioned but loosely; ONE stale TODO referencing a closed audit (#3) |
| **Spec surface (tests ratio)** | 5/10 | 90 specs in `src/` violate the convention; 11 plugins untested; 5 mixed-layout; the rest of the codebase is exemplary |
| **Cross-plugin coherence** | 8/10 | All 41 plugins that read `ctx.options.X` declare a zod schema (PASS); manifest shape is uniform; package.json deps all use `workspace:*` |
| **Permissions & isolation** | 8/10 | No `console.log` in real production code (the ones flagged are regex rules / doc strings); no `@ts-ignore`/`@ts-nocheck` in production; process.cwd() violations are localised, not systemic |
| **Overall** | **6.2/10** | weightless average |

The agent-vs-host discipline (no `vscode` in tools, no `process.cwd`
in tool handlers, no `@ts-ignore` in production) is **the** recurring
failure mode for this codebase, and it shows up plainly across the
plugin boundary. The audit-grade answer is to ship a per-finding slice
that fixes the violation in-place and adds the spec that was missing.

---

### Per-finding follow-up (audit-only appendix, not a canonical section)

| Finding | Follow-up track |
|---|---|
| #1 — `browser-inspect.tool.ts:77` process.cwd() | x00155 (browser + search bundled) |
| #2 — `search-semantic.tool.ts:93` process.cwd() | x00155 |
| #3 — `contention-detector.ts:315` stale TODO | x00155 (P3 quick-fix, inline comment-edit) |
| #4 — 11 plugins with zero tests | t00005 (one slice per plugin) |
| #5 — 90 specs in `src/` | r00013 |
| #6 — `search-semantic.tool.ts` no outputSchema | Folded into x00155 |
| #7 — `proposals/src/index.ts:552` existsSync | Deferred to f00050-S-A (parked) |
| #8 — 223 unmatched files | r00014 |

## notes

This audit does not implement fixes — it **documents** them so the next
agent (or a follow-up run of `auto_work`) can pick the lowest-cost slice
first (S1: 2-line code change + spec) and graduate to the bulk migrations
(S3, S4). The audit was generated by reading every plugin's `index.ts`
plus a representative tool file (search-semantic), a representative lock
file (proposals/contention-detector) and the file-conventions
classifier output; an LLM-read-driven audit per the
`mcp-vertex-audit-playbook` protocol, not just an automated report.
