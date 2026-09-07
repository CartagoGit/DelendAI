---
id: x00512
title: "CapabilityResolver: lazy resolves tools/skills without exposing the LLM to infrastructure"
kind: fix
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

# x00512 — CapabilityResolver: lazy resolves tools/skills without exposing the LLM to infrastructure

## Goal

Introduce a generic, lazy-loader-agnostic capability resolver so that
a tool or skill which exists in the catalog but is not currently in
the live `tools/list` is reported as **callable**, not as **disabled**.
The LLM expresses intent (qualified name OR (domain, action)); the
runtime resolves, activates if needed, materialises, and invokes.
Internal lifecycle states (`unloaded`, `pending`, `hidden`,
`deactivated`) never cross the wire as "tool disabled"; only the six
terminal reasons do (`catalog_missing | policy_denied |
host_read_only | activation_failed | argument_validation_failed |
execution_failed`).

Concretely, the proposal ships:

- `packages/core/src/lib/dispatch/capability-resolver.{ts,error.ts,identity.ts}`
  — a domain-agnostic resolver that walks the runtime's public
  catalog surface (`resolveRoute`, `getToolExposure`, `searchTools`).
- `packages/core/src/lib/tools/resolve-capability.tool.ts` — a
  always-visible MCP tool `delendai_resolve_capability` (registered
  in `BOOTSTRAP_CORE_TOOL_IDS`) that calls the resolver. Hosts that
  cache `tools/list` and never honour `tools/list_changed` can now
  dispatch through this single primitive without going through
  `tool_search` / `plugin_activate`.
- Single-flight plugin activation in
  `tool-surface-runtime.service.ts` so two concurrent activations of
  the same plugin share one loader call.
- A generic test suite (`packages/core/tests/src/lib/dispatch/`) that
  uses synthetic fixtures (`fake_alpha` / `fake_beta` / `fake_gamma`)
  and contains no hardcoded domain names.

## why

The lazy-load surface is correct architecturally, but the symptom
observed from multiple hosts is that a capability known to the catalog
but missing from `tools/list` is reported to the LLM as "disabled".
Even when the runtime's `invokeTool` happily executes it via the
compact router or after `plugin_activate`, the MCP host-client's
cached `tools/list` produces a terminal "tool disabled" answer that
the LLM treats as authoritative. Bypassing the canonical write path
to mutate files directly — seen in the previous session's `x00511`
attempt — is a state-inconsistency, not a fallback.

The core invariant: **lazy-load decides WHEN, not IF**. A capability
registered in the catalog is callable at any time, regardless of
whether it appears in `tools/list` of the host's last refresh.

## why this design

Generative design constraints:

- The LLM expresses intent, not infrastructure. `tool_search →
  plugin_activate → call` is a manual ritual that breaks when the
  host caches or skips a refresh.
- The resolver is a runtime-owned control plane. Activation,
  materialisation, and dispatch happen inside one function
  (`resolveAndInvoke`), so the LLM calls one entry point and the
  runtime decides what to do internally.
- No filesystem fallback for canonical write tools. When a tool
  exists in the catalog, mutating files directly is a state
  inconsistency, not a workaround.
- Surface modes control preload / token budget (`compact`,
  `managed`, `adaptive`), never permission.

## non-goals

- Not removing the existing `tool_search` / `plugin_activate` /
  `plugin_deactivate` tools — they remain administrative / debug
  primitives.
- Not re-platforming to non-MCP transports.
- Not migrating skills to lazy-load on demand in this proposal
  (tracked as a future slice, f00512-skill-lazy, dependent on S1).
- Not refactoring per-host adapter parity (e.g. VS Code Copilot vs
  Claude Code) — captured separately because it depends on
  per-host-empirical evidence.

## architecture

### Before

```
LLM
  ↓
intends to call tool "X"
  ↓
host's tools/list says "not present" (or "disabled")
  ↓
LLM must remember to call tool_search → plugin_activate → call
  ↓
if LLM forgets → writes file directly (filesystem fallback)
```

### After

```
LLM (or host via resolve_and_invoke primitive)
  ↓
intends capability X (qualified name OR (domain, action))
  ↓
CapabilityResolver.resolve
  ├─ catalog hit by qualified name?    → yes → continue
  ├─ catalog hit by (domain, action)?  → yes → continue
  ├─ catalog missing                   → terminal catalog_missing
  ├─ plugin idle but auto-loadable     → single-flight activate
  ├─ is it administratively deactivated → terminal policy_denied
  ↓
invoke with argument validation
  ↓
returns structured result, never "disabled"
```

### Implementation shape

```
packages/core/src/lib/dispatch/
├── capability-resolver.error.ts   # IResolverError discriminated union
├── capability-resolver.identity.ts# resolveIdentity + readRuntime + toRequestRecord
└── capability-resolver.ts         # resolveAndInvoke orchestration

packages/core/src/lib/tools/
├── compact-router.tool.ts         # (unchanged; S3 deferred)
└── resolve-capability.tool.ts     # always-visible MCP primitive (S4)

packages/core/src/lib/project/
└── tool-surface-runtime.service.ts# S2: activationsInFlight single-flight

packages/core/tests/src/lib/dispatch/
├── _fixtures/fake-runtime.ts      # synthetic catalog
└── capability-resolver.spec.ts    # 11 generic tests
```

## slices

### S1 — Foundation: `CapabilityResolver` interface and module

- **Status**: done
- **Files**:
  - `packages/core/src/lib/dispatch/capability-resolver.error.ts`
  - `packages/core/src/lib/dispatch/capability-resolver.identity.ts`
  - `packages/core/src/lib/dispatch/capability-resolver.ts`
- **Gate**: type
- acceptance:
  - `resolveAndInvoke` accepts `{qualifiedName}` AND/OR `{domain, action}` interchangeably.
  - The resolver does NOT import or reference any plugin id, tool id, namespace, or skill id. It only reads the runtime's public catalog surface (`recordsByName` via `searchTools`, `pluginIndex` via `resolveRoute`, `getToolExposure`).
  - `bun run typecheck` is green.
  - `bun run lint` is green (no baseline growth).

### S2 — Single-flight plugin activation

- **Status**: done
- **Files**:
  - `packages/core/src/lib/project/tool-surface-runtime.service.ts`
- **Gate**: type
- acceptance:
  - `tool-surface-runtime.service.ts` adds `private readonly activationsInFlight = new Map<string, Promise<IPluginSurfaceChange | null>>()`.
  - `activatePluginAsync` short-circuits when an activation for the same plugin id is in flight, sharing the exact same promise.
  - On settle, the entry is removed only when it still points to the just-finished task (race-safe against concurrent disposals).
  - The existing eviction / single-flight symmetry is preserved.
  - Existing tests in `tests/src/lib/project/tool-surface-runtime-eviction.spec.ts` continue to pass.

### S3 — Auto-activate on miss in `compact_router`

- **Status**: deferred
- **Files**:
  - `packages/core/src/lib/tools/compact-router.tool.ts`
- **Gate**: type
- acceptance:
  - The compact router output schema (`ROUTER_RESULT`) is load-bearing for several downstream tests and parsers; routing through the resolver changes the envelope shape and trips MCP `outputSchema` validation in the existing fixture for "compact exposes the vertex router while keeping long tool docs in knowledge". The compact router stays on its current `resolveRoute → invokeTool` pipeline for this proposal.
  - Follow-up tracked separately: **x00512 S3.PR** — tighten `ROUTER_RESULT` to allow an optional `error` block on terminal outcomes, then route the compact router through the resolver.
  - The new always-visible primitive (S4) is the path that exercises the resolver end-to-end today.

### S4 — Generic primitive `delendai_resolve_capability`

- **Status**: done
- **Files**:
  - `packages/core/src/lib/tools/resolve-capability.tool.ts`
  - `packages/core/src/lib/contracts/constants/bootstrap-core-tool-ids.constant.ts`
  - `packages/core/src/lib/cli/assemble-core-tools.ts`
- **Gate**: type
- acceptance:
  - New file `packages/core/src/lib/tools/resolve-capability.tool.ts` exporting `buildResolveCapabilityToolRegistration`.
  - `BOOTSTRAP_CORE_TOOL_IDS` includes `'resolve_capability'`.
  - The tool is registered by `assembleCoreTools` exactly once.
  - The handler delegates entirely to `resolveAndInvoke`; contains NO plugin id, tool id, namespace, or skill id.
  - Hosts that honour `tools/list_changed` see the new tool on the next refresh; hosts that do not can still dispatch through this single primitive.

### S5 — Host adapter parity

- **Status**: parked
- **Files**: `(none — captured as a future track)`
- **Gate**: type
- acceptance:
  - Each host client (VS Code Copilot, Claude Code, Cursor, Codex) gates the refresh differently. Audit + coordination with each host is a separate slice: `f00512-host-adapter-parity`.
  - This slice does NOT block S1–S4 + S6 because the resolver primitive (S4) already works regardless of host behaviour.

### S6 — Generic test suite

- **Status**: done
- **Files**:
  - `packages/core/tests/src/lib/dispatch/capability-resolver.spec.ts`
  - `packages/core/tests/src/lib/dispatch/_fixtures/fake-runtime.ts`
- **Gate**: test
- acceptance:
  - 11 tests pass; coverage spans every terminal reason (`catalog_missing`, `policy_denied`, `activation_failed`, `argument_validation_failed`, `execution_failed`, `host_read_only`) plus the success path.
  - All tests use a synthetic catalog (a fixture plugin set in `tests/src/lib/dispatch/_fixtures/`). **No real plugin name** is hardcoded in the test body.
  - One test asserts that no terminal outcome performs a filesystem write (filesystem-fallback invariant I3).
  - `bunx vitest run tests/src/lib/dispatch/` reports `Tests 11 passed (11)`.

### S7 — Skill lazy-loader

- **Status**: parked
- **Files**: `(empty — captured as a future track)`
- **Gate**: type
- acceptance:
  - `packages/core/src/lib/skills/sources/resolver.ts` currently loads eagerly. The same resolver pattern can be applied to skills.
  - Tracked as `f00512-skill-lazy` because it depends on S1.

### S8 — Generic bootstrap doc update

- **Status**: parked
- **Files**: `(TBD)`
- **Gate**: lint
- acceptance:
  - After S1–S6 ship and the resolver primitive is callable from every mode, edit `docs/delendai/AGENT-BOOTSTRAP.md`:
    - Replace any mention of "exists but disabled" with the generic invariant.
    - Remove counts (e.g. `47 / 166`), hardcoded plugin names, and the `tool_search → plugin_activate → call` ritual as a *required* pattern.
    - Keep `tool_search` and `plugin_activate` documented as administrative / discovery primitives, **not** as a happy-path protocol.
  - Do NOT mention `create_proposal` by name. Do NOT add numbers.

## dependency graph

```
S1 (foundation)
 ├─ S2 (single-flight in runtime)        ── independent
 ├─ S4 (resolve-capability primitive)    ── independent
 └─ S6 (tests)                            ── depends on S1
S3 (compact-router through resolver)     ── deferred (schema work)
S5, S7, S8                                ── captured as future tracks
```

## acceptance

- `bun run typecheck` green.
- `bun run lint` green or a baselined entry that names the new test suite, not the resolver behaviour.
- `bun run test packages/core` is green, including the 11 new tests.
- `bun run lint:proposals` is green on this proposal file.
- New commits on `develop`, pushed to `origin/develop`.
- No filesystem fallback appears in any new test, helper, or doc.

## risks and mitigations

- **R1 — Compact router regression**: routing the router through the resolver changes the envelope shape; S3 explicitly defers to avoid the failure surfaced in `tool-surface.e2e.spec.ts`. Mitigation: S4 ships the resolver as a new primitive today; S3.PR tightens the router output schema later.
- **R2 — Lazy-loader-skip risk**: a future plugin whose activation throws (e.g. invalid binary) might surface as `activation_failed` to the LLM instead of a recoverable hint. Mitigation: the resolver preserves the original thrown message in `detail` so the LLM can branch on it.
- **R3 — Hardcoding temptation**: developers adding new plugins might be tempted to map plugin ids in the resolver. Mitigation: the lint `lint:no-proposal-id-comments-in-source` and the generic test suite guard against the regression.

## notes

- The runtime's `getToolExposure` returns `'visible' | 'hidden' | 'unknown'` and conflates `'deactivated'` with `'hidden'`. The resolver surfaces `'deactivated'` only via the runtime's thrown `ToolNotAuthorizedError`, which `invokeResolved` maps to `policy_denied`. This is intentional: a policy decision is reported, not a lazy-load state.
- The resolver does NOT track `tools/list_changed` events itself. It is invoked lazily per call; the host's MCP `tools/list_changed` notification path is orthogonal.
