---
id: q00007
title: "agent-orchestrator — workflow policy plugin (single / linear / swarm / auto)"
kind: plan
status: in-progress
type: plan
track: workflow-policy
date: 2026-08-26
date_iso: 2026-08-26
author: mcp-vertex-orchestrator (MiniMax M3, agent mode)
related:
  - f00015 # plugin authoring playbook (precedent for SOLID plugin shape)
  - f00074 # core public API — `definePlugin` / `toolJson` / `toolError`
  - f00086 # plugins-markdown-rotation plugin (precedent for project boundaries)
contains:
    proposals:
        - { id: f00182, kind: feat, required: true, priority: P0, track: agent-orchestrator, slice: S1, title: "S1 — scaffold + policy engine + classifier + budget + rotation + plan tool" }
        - { id: f00183, kind: feat, required: true, priority: P0, track: agent-orchestrator, slice: S2, title: "S2 — linear dispatch + per-mode budget overrides + mid-task rotation wiring" }
        - { id: f00184, kind: feat, required: true, priority: P0, track: agent-orchestrator, slice: S3, title: "S3 — swarm parallel dispatch + join + dedupe + verify" }
        - { id: f00185, kind: feat, required: true, priority: P0, track: agent-orchestrator, slice: S4, title: "S4 — auto wiring tests + classifier regression + telemetry" }
        - { id: f00186, kind: feat, required: true, priority: P0, track: agent-orchestrator, slice: S5, title: "S5 — dogfood this repo on develop with `auto` default + open-source docs" }
        - { id: f00187, kind: chore, required: true, priority: P0, track: agent-orchestrator, slice: S6, title: "S6 — i18n for the 6 tool-strings + docs site entry" }
        - { id: t00007, kind: test, required: true, priority: P1, track: agent-orchestrator, slice: TEST, title: "TEST — coverage gate + smoke E2E invoking the plugin over assembleCliConfig" }
closureGate:
    requirePeerReview: true
    requireAllSlicesDone: true
    requireAllChildrenDone: true
globalGate: type
---

# q00007 — `agent-orchestrator` workflow policy plugin

## Goal

Convert the user's "configurable workflow policy" ask into a single
project-owned plugin that decides **how** the main agent works — not
which model, not which plugins:

| Mode | When it fits | Cost shape | Failure mode |
| --- | --- | --- | --- |
| `single` | trivial/small tasks, tight scope, ≤ ~280 chars of description | cheapest; one context window | self-retry (rotation trigger) |
| `linear`  | medium tasks, refactor-style | scout → implementer → verify | rotate one subagent at a time |
| `swarm`   | large tasks, root-level, audit-shaped | parallel slice A / slice B → join → verify | join wins or rotated fan-out |
| `auto`    | default for the dog's own development; classifies per task | scales with verdict from `TaskClassifier` | per-task classifier verdict |

Always enforces (every mode):

- `budget.maxTokensOrchestrator` / `budget.maxTokensPerSubagent`
  (orchestrator is the agent's *own* token spend; subagent is the
  cost of one sub-task).
- `rotation.maxIterationsPerSubagent` — hard cap, even mid-task.
- Mid-task rotation triggers (must be allowed explicitly in policy):
  `token-budget-exhausted`, `schema-violation`, `repeated-output`,
  `error-storm`. Anything else ⇒ the step fails fast (fail-closed).
- Per-call override (`override: OrchestrationMode` on the `plan` tool)
  for the host to bias the verdict on a specific call.

The plugin is a **policy layer** — it does NOT spawn subagents itself
(S2..S3 add the dispatch tools; the host orchestrates). v1 ships the
classifier + planner + budget + rotation detector so any executor
that consumes the plan can rely on a stable contract.

## Why

The user asked (one message, 2026-08-26) for a plugin they can configure
to choose *how* the agent works — task-by-task, swarm, mixed, etc. —
with budget + iteration caps and "if a subagent goes off-rails, kill
it and rotate even mid-task". They want:

- Code clean, SOLID, lint+types green, follows repo conventions.
- Tests covering the surface well, plus a smoke that proves E2E the
  plugin obeys what it claims.
- A complete proposal first, then autonomous implementation through
  subagents.

Today the repo wires several layers but none is a *workflow policy*:

- `auto-agent-selector` picks **which model** (cost↔quality dial).
- `auto-plugin-selector` picks **which plugins** to load.
- `orchestrator-runner` is the runtime layer (spend guard, handoff).
- `proposals` is the proposal state machine.

What is missing is the **mode** layer: the verb, not the noun. That is
what `agent-orchestrator` adds, on top of the existing pieces, without
duplicating any of them.

## Non-goals

- Re-implement the model router or the plugin recommender. The new
  plugin delegates model choice to `auto-agent-selector` and plugin
  choice to `auto-plugin-selector`.
- Add new shells, new persistence layers, or new lock primitives.
  Everything durable goes through `withFileMutex` + `writeFileAtomic`
  in `packages/core`; nothing plugin-private.
- Cover every conceivable orchestration shape in v1. The four modes
  above are the user's stated wish-list plus one safe default.
- Couple the plugin to a specific host. The plugin is a normal
  `@mcp-vertex/*` package and runs in every preset that loads it
  (`standard`, `swarm`, `full`, `vertex`).

### Repo invariants honoured

- `core stays agnostic` — the plugin never imports a project path or
  role enum; every domain input is a plain `ITask` with `id /
  description / tags / hint?`. ✅
- `no process.cwd()` — all paths come from `ctx.workspace` /
  `corePaths`. ✅ S1 has no file I/O outside `ctx`; S2+ does too.
- `async I/O only` — `BudgetTracker`, `LoopDetector`, `TaskClassifier`,
  `ModeRegistry` are all sync + pure. ✅
- `outputSchema on every tool` — the `plan` tool returns a strict
  zod shape; the error envelope follows `toolError(reason, nextAction)`. ✅
- `no hardcoded lists of skills / tools / proposal ids` — answers
  reference this proposal by id; the plugin advertises zero hardcoded
  tool/skill lists. ✅
- Conventional Commits + slice flow — every slice closes with `feat:`
  / `fix:` and is pushed via the standard proposal machinery. ✅
- Core dogfooding rule — the repo will adopt `defaultMode: "auto"` in
  `mcp-vertex.config.json` once S5 closes (not part of S1..S4).

## Architecture

```
                ┌────────────────────────────────────────────────────┐
                │           mcp-vertex.config.json (S5)              │
                │  policy:                                          │
                │    defaultMode: "auto"                            │
                │    defaults:                                      │
                │      budget: { orchestrator, subagent, timeout }  │
                │      rotation: { maxIterations, allow:[...] }      │
                └──────────────────────────┬─────────────────────────┘
                                           │
                ┌──────────────────────────▼─────────────────────────┐
                │  plugins/agent-orchestrator — `definePlugin`        │
                │   (S1)                                              │
                └──────────────────────────┬─────────────────────────┘
                                           │
                ┌──────────────────────────▼─────────────────────────┐
                │  OrchestratorEngine = registry + classifier + policy │
                │   - SingleModeAdapter            ✓ S1              │
                │   - LinearModeAdapter            ✓ S1 (plan only)  │
                │   - SwarmModeAdapter             ✓ S1 (plan only)  │
                │   - AutoModeAdapter              ✓ S1 (delegates)  │
                └──────────────────────────┬─────────────────────────┘
                                           │
                ┌──────────────────────────▼─────────────────────────┐
                │  Tool surface (this release)                       │
                │   <ns>_plan { task, override? } → IModePlan        │
                │   (S2+) <ns>_dispatch { plan, slot } → spawn       │
                │   (S2+) <ns>_budget  { budget } → IBudgetUsage     │
                └────────────────────────────────────────────────────┘
```

### SOLID hygiene

- **SRP**: each file owns one concern — types, registry, classifier,
  budget, rotation, mode adapters, planner façade.
- **OCP**: `ModeRegistry` is the OCP seam. New modes plug in via
  `register()` without touching `plan()`.
- **LSP**: every `IModeAdapter` honours the `accepts()` + `plan()`
  contract — same shape in, same shape out, no thrown surprises
  except `UnknownModeError` (unknown at registration time ⇒ fail fast).
- **ISP**: `IModeAdapter` is the *only* interface an adapter must
  satisfy; `IBudgetPolicy` / `IRotationPolicy` are tiny too.
- **DIP**: the engine depends on abstractions (interfaces) not on
  concrete adapters; tests inject a fake adapter in `registry.spec.ts`
  to prove the seam.

### Reusable code

- Reuses `definePlugin`, `toolJson`, `toolError`, `TOKEN_BUDGETS` from
  `@mcp-vertex/core/public` — no fork.
- Reuses the `IModePlan` shape across all four modes; the executor (S2+)
  reads one zod schema and gets a typed plan.
- Reuses the proposals plugin's slice flow — every S# is a child of
  q00007 with `required: true`; closure is gated by the proposals
  closure mechanism.

## Slices

### S1 — scaffold + policy engine + `plan` tool (this release)

**Status**: ✅ **done** in this proposal commit.

- **Files**: `plugins/agent-orchestrator/` source, public contracts and tests
- **Gate**: `bun run typecheck && bun run test`

**Deliverables**:

- `plugins/agent-orchestrator/{package.json, plugin.manifest.ts,
  tsconfig.json, vitest.config.ts}` (BSD-3, presets `standard|swarm
  |full|vertex`, schema-tier budget).
- `src/lib/policy/{types.ts, registry.ts, policy.ts}` — domain types,
  OCP-friendly `ModeRegistry`, façade.
- `src/lib/policy/modes/{single,linear,swarm,auto}-mode.ts` — one
  adapter per mode (`auto` delegates to the classifier).
- `src/lib/classifier/task-classifier.ts` — pure heuristic.
- `src/lib/budget/budget-tracker.ts` — token accounting.
- `src/lib/rotation/loop-detector.ts` — every trigger reason.
- `src/lib/tools/plan.tool.ts` — single MCP tool, `outputSchema`.
- `src/{index,public/index}.ts` — `definePlugin` + public surface.
- 9 `*.spec.ts` files, 56 tests, all green.
- Typecheck: clean. Build (`bun run build plugins/agent-orchestrator`):
  emits `dist/{index,public/{index.js,index.d.ts}}` and
  `dist/lib/**.d.ts`.

**Acceptance**: `bun run typecheck` + `bun run test` + `bun run build plugins/agent-orchestrator` are green; `src/public/index.ts` re-exports the contract.

### S2 — linear dispatch + per-mode budget + rotation wiring

- **Status**: pending
- **Files**: `plugins/agent-orchestrator/src/lib/dispatch/` and related tests
- **Gate**: `bun run test`

**Goal**: make the linear plan actually execute. Host dispatches via
`<ns>_dispatch { plan, slot }`; the plugin records tokens via
`BudgetTracker`, evaluates `LoopDetector`, and emits mid-task rotations
when the trigger is in `allow[ ]`.

**Out of scope**: swarm fan-out (S3).

**Acceptance**: end-to-end mock that drives 3 scout/implementer/verify
steps, fakes a `repeated-output` on step 2, asserts the planner emits
a fresh subagent id for step 2' before continuing to step 3, and
records token spend per subagent.

### S3 — swarm parallel dispatch + join + dedupe

- **Status**: pending
- **Files**: `plugins/agent-orchestrator/src/lib/policy/modes/` and related tests
- **Gate**: `bun run test`

**Goal**: parallel subagents with deterministic join; on
`schema-violation` of *any* slice, replace that slice only.

**Acceptance**: a 5-step swarm plan runs concurrently; the `join`
step sees a coherent merged change; a forced `schema-violation` on
slice A spawns slice A' rather than blowing the whole swarm.

### S4 — auto wiring tests + classifier regression + telemetry

- **Status**: pending
- **Files**: classifier, telemetry and auto-mode sources/tests
- **Gate**: `bun run test`

**Goal**: the `auto` mode is the default for dogfooding. So we need:

- Snapshot tests of every classifier verdict on a 30-task fixture set.
- Telemetry: every `plan()` call emits one structured event (mode,
  inner mode, classifier confidence) the `logs` plugin captures.
- Surface a `<ns>_classify` read-only tool for the host to probe the
  classifier without planning.

**Acceptance**: snapshot tests identical across runs; logs surface the
event; `classify` tool passes E2E via `assembleCliConfig`.

### S5 — dogfood on `develop` + open-source docs

- **Status**: pending
- **Files**: `mcp-vertex.config.json`, `apps/web/` docs and integration tests
- **Gate**: `bun run validate`

**Goal**: this repo adopts `agent-orchestrator` with `defaultMode: "auto"`
via `mcp-vertex.config.json → orchestrator.policy`. Proves the plugin
on the most demanding dogfood: the repo's own proposal machinery.

**Acceptance**: `bun run validate` green with the plugin loaded; a
short docs page in `apps/web/` describing the four modes.

### S6 — i18n keys for the 6 tool-strings

- **Status**: pending
- **Files**: `plugins/agent-orchestrator/` i18n resources and tests
- **Gate**: `bun run --cwd extensions/vscode check:i18n`

**Goal**: every visible tool string gets the `apps/web`-style i18n
entry. Already-prepared English defaults are kept as fallback.

**Acceptance**: `biome ci extensions/vscode` + `bun run --cwd extensions/vscode check:i18n`
remain green for the affected keys.

### TEST — coverage gate + smoke E2E

**Goal**: blackbox coverage gate via `vitest --coverage` on the
plugin; smoke test that invokes the plan tool over
`packages/core/.../assembleCliConfig`, asserting a trivial task
routes to `single`, a `["swarm"]` task routes to `swarm`, and that an
override on the tool actually changes the plan mode.

**Acceptance**: ≥ 90% line + branch coverage; smoke passes.

## acceptance

Everything in S1 compiles + tests + builds clean under today's repo
rules (`bun run typecheck`, `bun run test`, `bun run build`). The
remaining slices inherit the same contract. Closing q00007 means:

- All six children (`f00182..f00187`) are `status: done`.
- `t00007` is `status: done` with coverage report attached.
- `bun run validate` is green with the plugin in `--plugins`.
- The plugin ships as a public `@mcp-vertex/agent-orchestrator`
  package on the same registry as the rest of the workspace.

## risks and mitigations

- **Plandown (default mode declines)** — engine silently falls back
  to `auto`, which routes through the classifier. Tested in
  `policy.spec.ts`.
- **Invalid `defaultMode`** — `assertPolicyValid()` raises
  `RangeError`; `register()` returns `{ tools: [], knowledge: [],
  errors: [toolError(...)] }` so the host can skip cleanly.
- **Duplicate registration** — `DuplicateModeError`. Tested.
- **`hint` optional on `ITask`** — the tool rebuilds an `ITask` with
  exact spread to satisfy `exactOptionalPropertyTypes`.
- **No-process.cwd / no-sync-io** — the policy engine is pure (no I/O).
- **Token-budget 0** — interpreted as "no cap", not as "exhausted".
  Tested in `budget-tracker.spec.ts`.
- **Rotation when `allow` is empty** — every detector returns
  `null` ⇒ no rotation; the executor surfaces it as a config bug
  instead of rotating on a forbidden trigger.

## notes

The user authorised autonomous multi-turn execution. From here on:

1. `mcp-vertex_overview` once per session (no fan-out of knowledge
   fetches — a memory entry already records the rule).
2. For S2..S5: each slice opens via `proposals_auto_work` →
   `claimReady` → claim → implement → test → close.
3. The orchestrator subagent (`mcp-vertex-orchestrator`) drives the
   heavier slices; subagents (`technical-investigator`,
   `implementation-runner`) are used for the contained parts.

