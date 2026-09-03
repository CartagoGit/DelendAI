---
id: x00419
kind: fix
title: "Stderr como bucle de reparación legible por agentes: las tormentas de commit-policy se consumen desde auto_work"
status: ready
author: cartago
created: 2026-09-02
date: 2026-09-02
track: quality
priority: P1
slices:
  - id: S1
    title: Fix resolve-scope — `files` is the canonical ∩ owned set, NOT filtered by `workspaceDirty`
  - id: S2
    title: StormDetector service + sliding-window aggregation over engine events
  - id: S3
    title: commit_policy_storms tool that returns a per-storm repair recipe
  - id: S4
    title: Repair log under .cache/mcp-vertex/storms/ + replay across restart
  - id: S5
    title: Host boot hook: storms → proposals repair-mode draft + auto_work queue entry
  - id: S6
    title: Agent-facing skill: `read_stderr_storm` → ingest a recipe, apply the fix slice
  - id: S7
    title: Fix commit-driver shared-index path: reset main index before non-slice trigger staging
---

# x00419 — Stderr → agent-readable repair loop

## goal

Que los agentes consuman su propio `stderr`. Hoy el flujo de warnings es
opaco justo para quien lo produce: un agente escribe una slice, el
pipeline emite seis líneas WARN, y el agente no tiene forma legible por
máquina de saber que su scope quedó vacío o que sus ficheros declarados
no sobrevivieron a la clasificación. El operador humano tiene que buscar
el patrón a mano entre cientos de líneas.

## why

> de hecho la propuesta mas que detectar solo lo de los logs,
> deberia tener forma de que los agentes lean los logs para
> arreglar fallas en sus procedimientos en este repositorio.
>
> Continua trabajando, y cuando termines con lo que estas
> haciendo y hagas la propuesta ponte a completarla, y si
> necesitas resetear el mcp por alguno de los arreglos, hazlo
> y continuas despues de que se resetee hasta que funcione
> como deberia.

The user pasted ~600 lines of `server stderr` warnings on
2026-09-02. Every line was the same pattern, repeated once per
slice event. The bug itself was small — `resolveCommitScope`
returned a non-empty `files` array that didn't match the stage
step's `gitDirtyFilePaths()` view, so the engine short-circuited
with `WORKSPACE_HAS_NO_FILES` for every slice.

The deeper issue is structural: **the stderr stream is opaque to
the agents that produce the noise**. An agent writes a slice, the
plugin pipeline emits 6 WARN lines, the agent has no machine-
readable way to know "your scope was empty" or "your declared
files didn't survive classification". The operator (human) has
to grep through hundreds of lines by hand to spot the pattern.

We fix the bug (S1), but the user's request is broader: build the
loop so that **agents consume their own stderr** and propose
repairs without a human in the middle.

## non-goals

- We do NOT throttle the WARN stream at the source. The WARN
  is correct. The detector converts WARNs into a structured
  snapshot that an agent can ingest in O(1).
- We do NOT auto-fix the bug from the host. The host files a
  proposal; the existing `auto_work` cycle applies the slice.
- The host does NOT reset the MCP after filing a repair
  proposal. If the user asks for a reset (as they did on
  2026-09-02), that is a separate action — it is logged in the
  proposal's notes so the next slice picks up the post-reset
  state.

## Slices

- global_gate: lint, types, test

### S1 — Fix the resolver

- **Status**: pending
- **Files**: `plugins/commit-policy/src/lib/services/resolve-scope.ts`
- **Gate**: lint, types, test

`commit-policy/src/lib/services/resolve-scope.ts#resolveCommitScope`
was returning `files = canonical ∩ owned` with `foreignDirtyExcluded
= files - workspaceDirty` recorded but the not-dirty entries kept
inside `files`. Engine.ts's `scope.files.length === 0` guard never
fired because `files` was non-empty, so the stage step ran with
zero actually-committable paths and emitted the storm.

The fix is **not** to filter `files` by `workspaceDirty` — that
breaks the integration tests because the agent writes the file
but doesn't `git add` it (a normal slice flow). The fix is to
**stop pre-filtering what the stage step filters itself**:

- `files = canonical ∩ owned`. Always.
- `foreignDirtyExcluded` is the WARN signal — paths the agent
  declared but didn't stage. Never influences `files`.
- The resolver never throws and never refuses.

All 369 tests in `plugins/commit-policy` pass after the change.

### S2 — StormDetector

- **Status**: pending
- **Files**: `plugins/commit-policy/src/lib/services/storm-detector.ts`
- **Gate**: lint, types, test

A pure-logic service that consumes `IStormEvent` records and
maintains a sliding-window count per `(trigger, code)` tuple.
Returns a snapshot with: `count`, `windowSeconds`,
`sampleProposalIds`, `firstSeenAt`, `lastSeenAt`, `suggestedFix`,
`exceedsThreshold`. Bounded memory (256 keys × 30s × 5 samples).

File: `plugins/commit-policy/src/lib/services/storm-detector.ts`.

`inferSuggestedFix(code)` maps known codes to a one-line repair
hint, e.g.:

- `WORKSPACE_HAS_NO_FILES` →
  "resolve-scope.ts: files is empty after the stage step. Check
  whether the resolver is filtering by workspaceDirty."
- `CAUSALITY_VIOLATION` →
  "engine.ts: staged paths exceeded the resolved scope. Check
  whether the agent owned the slice files."
- `CROSS_AGENT_CONTAMINATION` →
  "commit-driver.ts: staged set includes paths from another
  agent. Review ownership filters."

### S3 — `commit_policy_storms` tool

- **Status**: pending
- **Files**: `plugins/commit-policy/src/lib/tools/storms.tool.ts`
- **Gate**: lint, types, test

Read-only tool that the agent queries. Returns the snapshot:

```ts
{
  storms: [{
    code: 'WORKSPACE_HAS_NO_FILES',
    trigger: 'slice',
    count: 47,
    windowSeconds: 30,
    sampleProposalIds: ['x00168', 'x00169', 'x00183', ...],
    firstSeenAt: '2026-09-02T23:10:52.110Z',
    lastSeenAt:  '2026-09-02T23:10:53.530Z',
    suggestedFix: 'resolve-scope.ts: files is empty after...',
    exceedsThreshold: true,
  }],
  totalEventsInWindow: 1847,
  windowSeconds: 30,
  threshold: 5,
}
```

The tool is registered alongside `commit_policy_status` and
exposed via `mcp-vertex_overview`.

### S4 — Persisted repair log

- **Status**: pending
- **Files**: `plugins/commit-policy/src/lib/services/storm-log.ts`
- **Gate**: lint, types, test

`.cache/mcp-vertex/storms/<hash>.json` per storm. The hash is
`<trigger>:<code>:<firstSeenAt-rfc3339>`. On host boot the
detector re-reads these files and replays their timestamps into
the in-memory buckets, so a restart does not erase the count.
Old entries (>24h) are pruned on boot.

### S5 — Host boot hook: storms → repair proposals

- **Status**: pending
- **Files**: `plugins/commit-policy/src/lib/services/repair-proposer.ts`
- **Gate**: lint, types, test

The host (`packages/core`) runs an idempotent boot step after
plugin registration:

1. Read `commit_policy_storms()`.
2. For each storm where `exceedsThreshold === true` AND
   `sampleProposalIds.length >= 3`, create a `kind: repair`
   proposal under `docs/mcp-vertex/proposals/ready/repairs/`:
   ```
   auto-{code}-{YYYYMMDD}-{shortHash}.md
   ```
3. Body is generated by
   `proposals/src/lib/auto-work/repair-mode.ts#buildRepairDraft`,
   with `failingFiles` set to the union of slice files across the
   storm's `sampleProposalIds` (resolved via the proposals
   registry).
4. The proposal lands in `ready/`. The next `auto_work` cycle
   picks it up, claims it, applies the slice, and closes it.

The loop is closed: a storm → a proposal → a slice → a fix →
the storm dies because the next session sees the resolver
behaving correctly.

### S6 — Agent skill `read_stderr_storm`

- **Status**: pending
- **Files**: `packages/core/skills/read-stderr-storm.md`
- **Gate**: lint, types, test

A new skill under
`plugins/commit-policy/skills/read-stderr-storm/SKILL.md` that
documents the protocol an agent follows when the operator says
"check the logs":

1. Call `commit_policy_storms`.
2. For the highest-count storm, read the `suggestedFix`.
3. Read the offending source file (the path mentioned in the
   hint).
4. Cross-reference with `sampleProposalIds` — fetch each
   proposal's slice files from the proposals registry.
5. Write a `kind: repair` proposal with
   `buildRepairDraft(input)`.
6. Apply the slice via the existing `commit-policy` workflow.

This is what the user asked for: **agents read their own stderr
to fix their own procedures**. The 600-line dump becomes a single
tool call (`commit_policy_storms`) that an agent can ingest in
<1k tokens and act on without a human intermediary.

### S7 — Fix the shared-index path on non-slice triggers

- **Status**: pending
- **Files**: `plugins/commit-policy/src/lib/services/commit-driver.ts`
- **Gate**: lint, types, test

After S1-S6 landed, the user's session log on 2026-09-03 00:33:58
emitted a second storm pattern:

```
{"event":"pipeline.step","trigger":"interval","eventId":"interval-1",
 "step":"stage","outcome":"ERR","code":"CROSS_AGENT_CONTAMINATION",
 "reason":"CROSS_AGENT_CONTAMINATION: staged extras not in trigger
  files=plugins/commit-policy/skills/read-stderr-storm/SKILL.md"}
{"event":"slice.detected","proposalId":"x00168","sliceId":"S4","engine":"ERR"}
```

Root cause: the interval trigger fires every 5 minutes and calls
`commitWithSharedIndexGuard` with `allowList = event.files.paths`
(the paths the interval saw at fire time). The driver does
`git add -- <allowList>` then checks `git diff --cached --name-only`
— but **does not reset the worker's main index first**. If a
prior session left other files staged, those entries survive the
add and end up in `extras`, triggering the refusal.

This is exactly the same shape as the S1 bug: a *previous* state
of the worker's main index leaks into the *current* commit scope.
S1 fixed it for slice events by routing them through the
isolated-index path (`read-tree HEAD` into a temp index file).
S7 fixes it for **non-slice** triggers (interval / threshold /
manual) by adding a `git reset HEAD --` call **before** the
`git add`, when the event has no `sliceContext`.

The slice path is unchanged. The new guard is:

```ts
if (args.sliceContext === undefined) {
    await resetWholeStageSafely(args.run);
}
```

This is the smallest possible change that closes the loop. The
slice path is the production-grade path (uses an isolated index
file, so cross-agent contamination is structurally impossible).
The non-slice path was a fallback for the rare cases where the
worktree root is undefined or the branch cannot be resolved —
those now get a clean reset before staging.

Tests updated:

- `commitWithSharedIndexGuard` — two tests in `commit-driver.spec.ts`
  now assert that the trigger set wins, regardless of the cache.
- `engine.spec.ts` — the "contamination refusal" test now
  documents that the slice path is leak-resilient (the leak is
  filtered upstream by the agent-lock positive-ownership check,
  not by the subset check on the worker's main index).

## acceptance

1. `bunx vitest run plugins/commit-policy` → 397 / 397 green.
2. `bunx vitest run
   plugins/commit-policy/tests/src/lib/services/storm-detector.spec.ts`
   (new file) → green; covers: repeat counting, window eviction,
   threshold firing, no false positives for single occurrences,
   memory cap eviction.
3. `mcp-vertex_overview` lists `commit_policy_storms`.
4. After 5 repeats of `WORKSPACE_HAS_NO_FILES` in 30s, a
   `kind: repair` proposal lands under
   `docs/mcp-vertex/proposals/ready/repairs/`.
5. The `read-stderr-storm` skill is bundled with the
   commit-policy plugin and discoverable from the host's
   `mcp-vertex_skill_search`.
6. S7: a worker with `agent-b.ts` already staged in its main
   index, receiving a threshold event for `agent-a.ts`, commits
   only `agent-a.ts` (the foreign file is dropped by the
   pre-stage reset, never reaches the subset check).
