---
id: x00512
title: "CapabilityResolver: lazy resolves tools/skills without exposing the LLM to infrastructure"
kind: feat
status: ready
type: proposal
track: architecture
date: 2026-09-07
priority: P0
audit-source:
  file: docs/delendai/audits/2026-09-07-develop-external-audit.md
  finding: AUD-LAZY-DISABLED-001 + AUD-FALLBACK-FS-001 + AUD-RESOLVER-MISSING-001
  snapshot: 4a5d132add80cd1a182fd9dce73a5a2ed15cc229
related:
  - x00510
  - x00511
  - r00043
  - r00041
  - f00507
---

# x00512 — CapabilityResolver: lazy without illusion

## Symptom

The lazy-load surface is correct architecturally, but the symptom observed
from multiple hosts (VS Code Copilot Chat, Claude Code, MCP Inspector) is:

> A tool or skill that **exists in the catalog** but is **not currently in
> the live tools/list** is reported to the LLM as **"disabled"** /
> **"not available"** — even though `runtime.invokeTool` will happily
> execute it via `delendai_compact_router` or after `plugin_activate`.

Concrete reproductions seen in this repo:

1. The agent in `delendai-orchestrator` mode had `create_proposal`
   registered with `active: false` via `tool_search`. After
   `plugin_activate`, `tool_search` returned `disabled by the user`
   even though the runtime had emitted `tools/list_changed`. The agent
   then wrote the `.md` file directly, bypassing the canonical
   `create_proposal` write path.
2. After a `plugin_activate`, the **runtime** shows `loadedPluginCount:1,
   active:true` while the **MCP host client** still routes the next
   `tool_search` to a cached "disabled" answer. There are two layers of
   truth: the runtime says "go", the host says "stop".

Both are caused by the same design choice: lazy-load delegates state
management to the LLM. The LLM is asked to remember "call `tool_search`
→ `plugin_activate` → call" for every capability. When the LLM forgets
that, or when the host cache lags behind the runtime, it surfaces as
"tool disabled" — which is the wrong terminal state for an internal
lazy-load transition.

## Goal

Introduce a generic, lazy-loader-agnostic **capability resolution
control plane** so that:

> **The runtime owns "exists but not loaded" as an internal state.
> "Disabled" is a permission answer, not a lazy-load answer.**

The LLM expresses intent (qualified name, or domain+action). The
runtime resolves, activates if needed, materialises, and invokes. The
state machine distinguishes:

| Internal (recoverable) | Terminal (returned to the LLM) |
|---|---|
| `unloaded`, `pending`, `hidden`, `deactivated` | `catalog_missing` |
|                                  | `policy_denied` |
|                                  | `host_read_only` |
|                                  | `activation_failed` |
|                                  | `argument_validation_failed` |
|                                  | `execution_failed` |

Internal states never cross the wire as "tool disabled". Only the
terminal states do. The LLM can still call `plugin_activate` /
`tool_search` for diagnostic / administrative purposes, but it is no
longer required for the happy path.

## Why now

Multiple in-flight proposals already touch parts of this surface:

- `r00043` (`core` stops knowing the `proposals` domain) is moving
  invariant declarations out of `core`. The new resolver must be
  domain-agnostic.
- `r00041` (`client` stops dragging `core`) is reshaping the host
  adapter. The resolver must work with both static and dynamic host
  surface modes (MCP `tools/list_changed`).
- `f00507` S4 ("economic routing") extends the dispatch path. The
  resolver is the natural home for that economy.

Without a dedicated control plane, every plugin / host / surface change
re-opens the "disabled-but-callable" seam.

## Invariants

I1. **Lazy-load decides WHEN, not IF.** A capability registered in the
    catalog is callable at any time, regardless of whether it appears in
    `tools/list` of the host's last refresh.

I2. **Internal states are hidden from the LLM's view.** `hidden`,
    `not_loaded`, `deactivated` are runtime-internal. The LLM only ever
    sees terminal errors with a structured reason.

I3. **No filesystem fallback for canonical write tools.** When a
    capability `c` is registered in the catalog, invoking it is the only
    way to perform its write. Bypassing `c` by mutating files directly
    is a state-inconsistency, not a "fallback".

I4. **Single-flight by `pluginId`.** Two concurrent activations of the
    same plugin resolve to one loader invocation. Per-call `await` is
    preserved.

I5. **No hardcoded plugin / tool / skill IDs in the resolver.** The
    resolver walks the catalog (which already exists in
    `managed-lazy-catalog.generated.ts` and
    `skills/sources/resolver.ts`). Tomorrow's plugin or skill works
    without editing the resolver.

I6. **Surface modes control preload / token budget, not permission.**
    `managed`, `adaptive`, `compact` decide which tools are eagerly
    visible. They do not decide which tools are callable. The runtime
    makes every catalog tool callable in every mode.

I7. **Hosts that support `tools/list_changed` get a clean refresh.**
    Hosts that don't get a generic, always-visible resolver primitive
    that performs resolve→activate→materialise→invoke internally.

I8. **Concurrency is safe across plugin activation, deactivation, and
    tool invocation.** A plugin being evicted while a resolver call is
    in flight must not produce a partial result. The existing
    `disposalsInFlight` guard is reused; a symmetric `activationsInFlight`
    is added.

## Non-goals

- Not removing `tool_search` / `plugin_activate`. They are kept as
  administrative / debug primitives.
- Not re-architecting `proposals`-specific code. The resolver is
  domain-agnostic.
- Not making `surfaceMode: native` mandatory. Hosts may keep
  `managed`/`compact`/`adaptive` for token efficiency. The resolver
  guarantees those modes don't gate capability.

## Architecture — before and after

### Before

```
LLM
  ↓
intends to call tool "create_proposal"
  ↓
host's tools/list says "not present"  (or "disabled")
  ↓
LLM must remember to call
  tool_search → plugin_activate → call
  ↓
if LLM forgets → writes file directly (FS fallback)
```

### After

```
LLM (or host via resolve_and_invoke primitive)
  ↓
intends capability "create_proposal" or { domain: "proposals", action: "create_proposal" }
  ↓
CapabilityResolver.resolve
  ├─ catalog hit by qualified name?      → yes → continue
  ├─ catalog hit by domain.action?       → yes → continue
  ├─ catalog missing                     → terminal catalog_missing
  ↓
  ├─ is it visible?                      → yes → invoke
  ├─ is it hidden in current surface?    → yes → activate plugin (single-flight)
  ├─ is it deactivated (permission)?     → terminal policy_denied
  ↓
  invoke with argument validation
  ↓
  returns structured result, never "disabled"
```

## Slices

### S1 — Foundation: `CapabilityResolver` interface and module

- New file: `packages/core/src/lib/dispatch/capability-resolver.ts`.
  Exports `resolveCapability(runtime, input)` that accepts either
  `{ qualifiedName }` or `{ domain, action }`.
- New file:
  `packages/core/src/lib/dispatch/capability-resolver.error.ts`
  exporting a discriminated `IResolverError` union with the six
  terminal states in the table above.
- New file:
  `packages/core/src/lib/dispatch/capability-resolver.spec.ts`
  with generic fixtures (a synthetic plugin/tool catalog).
- Gate: lint + typecheck + 12+ new test cases passing.
- Acceptance:
  - `resolveCapability` accepts `{qualifiedName:"delendai_x_y"}` and
    `{domain:"x", action:"y"}` interchangeably.
  - The resolver does **not** import or reference any plugin id,
    tool id, namespace, or skill id. It only reads
    `runtime.recordsByName`, `runtime.recordsByDomain`,
    `runtime.pluginIndex`, etc.
  - Mock runtime is used in tests; no real MCP server is required.

### S2 — Single-flight plugin activation

- Modify
  `packages/core/src/lib/project/tool-surface-runtime.service.ts`:
  add `private readonly activationsInFlight = new Map<string, Promise<void>>()`
  field; add
  `private async activatePluginSingleFlight(identifier): Promise<IPluginSurfaceChange | null>`.
- When `activatePluginAsync` is called:
  - If `activationsInFlight.has(id)`, await the existing promise.
  - Otherwise, create a promise that runs `lazyPluginLoader(plan)` then
    `setPluginState(true)`, store it in the map, and on settle remove it.
- Tests:
  `packages/core/tests/src/lib/project/tool-surface-runtime.single-flight.spec.ts`.
  - Two concurrent `activatePluginAsync("pluginX")` calls share exactly
    one loader invocation.
  - A third call after both complete reuses the loaded state without
    a new loader run.
  - Deactivation mid-activation does not leave a half-loaded record.

### S3 — Auto-activate on miss in `compact_router`

**STATUS: deferred (status update after first implementation pass).**

The compact_router output schema (`ROUTER_RESULT`) is load-bearing
for several downstream tests and parsers; routing it through the
resolver changes the envelope shape and trips MCP `outputSchema`
validation in the existing fixture for
"compact exposes the vertex router while keeping long tool docs in
knowledge". The compact_router stays on its current
`resolveRoute → invokeTool` pipeline for this proposal. The new
always-visible primitive in S4 is the path that exercises the
resolver end-to-end today.

Follow-up tracked separately: x00512 S3.PR — tighten `ROUTER_RESULT`
to allow an optional `error` block on terminal outcomes, then
route compact_router through the resolver.

### S4 — Generic primitive `delendai_resolve_capability`

- New file:
  `packages/core/src/lib/tools/resolve-capability.tool.ts`.
  Always-visible bootstrap tool (registered in
  `BOOTSTRAP_CORE_TOOL_IDS`).
- Input: `{ qualifiedName?: string, domain?: string, action?: string,
  args?: Record<string, unknown> }`.
- Behaviour: calls `resolveCapability` → `invokeTool` and returns the
  raw tool result.
- This is the entry point for hosts that **don't** support
  `tools/list_changed` and where the LLM only knows the qualified
  name. The LLM calls **one** tool instead of three.

### S5 — Host adapter parity (deferred — captured as a future track)

- The MCP `createMcpProject` server already emits `tools/list_changed`.
  But each host client (VS Code, Claude Code, Cursor, Codex) gates the
  refresh differently. Audit + coordination with each host is a
  separate slice: f00512-host-adapter-parity.
- This slice does NOT block S1–S4 because the resolver primitive (S4)
  already works regardless of host behaviour.

### S6 — Generic test suite

- `packages/core/tests/src/lib/dispatch/capability-resolver.spec.ts`
  covering:
  1. tool known by qualified name → resolves
  2. tool known by domain+action → resolves
  3. tool known by both → resolves, prefer qualified name
  4. tool not in catalog → `catalog_missing`
  5. tool deactivated → `policy_denied` (not "disabled")
  6. plugin activation throws → `activation_failed`
  7. concurrent activations → exactly one loader call (single-flight)
  8. same plugin already active → no loader call
  9. invalid arguments → `argument_validation_failed`
  10. handler throws → `execution_failed`
  11. compact_router miss → `catalog_missing` (not "no_match")
  12. router hit + hidden plugin → auto-activates, returns result
- All tests use a synthetic catalog (a fixture plugin built in
  `tests/src/lib/dispatch/_fixtures/`). **No real plugin name** is
  hardcoded in the test body.

### S7 — Skill lazy-loader (parallel effort, captured but not in this proposal)

- `packages/core/src/lib/skills/sources/resolver.ts` currently loads
  eagerly. The same resolver pattern can be applied to skills.
- Tracked as f00512-skill-lazy because it depends on S1.

### S8 — Generic bootstrap doc update

- After S1–S6 ship and the resolver primitive is callable from every
  mode, edit `docs/delendai/AGENT-BOOTSTRAP.md`:
  - Replace any mention of "exists but disabled" with the generic
    invariant: "a capability registered in the catalog is callable in
    every surface mode via the resolver".
  - Remove counts (47/166), hardcoded plugin names, and the
    `tool_search → plugin_activate → call` ritual as a *required*
    pattern.
  - Keep `tool_search` and `plugin_activate` documented as
    administrative / discovery primitives, **not** as a happy-path
    protocol.
  - Do NOT mention `create_proposal` by name. Do NOT add numbers.

## Definition of done for S1–S4 + S6

- `bun run typecheck` green.
- `bun run lint` green or a baselined entry that names the new test
  suite, not the resolver behaviour.
- `bun run test packages/core` is green, including the 12+ new tests.
- `bun run validate` is green.
- New commit on `develop`, pushed to `origin/develop`.
- No filesystem fallback appears in any new test, helper, or doc.

## Out of scope

- Removing the existing `compact_router` / `tool_search` /
  `plugin_activate` tools.
- Re-platforming to non-MCP transports.
- Removing `proposals` domain coupling (that's r00043).
- Refactoring host adapters (each host is its own track).
