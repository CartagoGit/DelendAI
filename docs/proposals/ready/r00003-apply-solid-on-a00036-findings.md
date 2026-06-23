---
id: r00003
status: ready
type: proposal
track: core+cli+extensions+plugins+architecture+refactor
date: 2026-06-23
kind: refactor
title: Apply SOLID to the a00036 findings — 5 P0 slices + 11 P1 slices, grouped by file
shipped-in: []
related:
    - a00036 # audit whose findings drive this proposal
    - u00002 # sibling: gate agent_worktree behind a host flag
    - f00050 # sibling: quick-wins across the same findings
ownership:
    - { agent: implementation_runner, task: 'S1 (P0): F-002 — `assemble.ts` blueprint write goes through a durable once-only primitive (mutex + writeFileAtomic)' }
    - { agent: implementation_runner, task: 'S2 (P0): F-001 — `cli/server-args.ts` flags forwarding by declarative table (O + I)' }
    - { agent: implementation_runner, task: 'S3 (P0): F-003 — `fs-tools.ts` remove `atomic: false` from the public tool surface (L + I)' }
    - { agent: implementation_runner, task: 'S4 (P0): EXT-01 — `extensions/vscode/src/extension.ts` runtime handle + real `deactivate()` (S + D)' }
    - { agent: implementation_runner, task: 'S5 (P0): TS-01 — `plugin-tool-verify.script.ts` plugin loader via injected root (D)' }
    - { agent: implementation_runner, task: 'S6 (P1): F1 partial — `loop-detector-service.ts` SRP/DIP cleanup of remaining hot-path sync I/O (gated by parallel-agent WIP)' }
    - { agent: implementation_runner, task: 'S7 (P1): F2 — `proposal-scaffold-linter.ts` remove host-specific narrative from runtime linter (S + O + D)' }
    - { agent: implementation_runner, task: 'S8 (P1): F3 — `chat-titling-reminder.ts` host/version-agnostic reminder (S + O + D)' }
    - { agent: implementation_runner, task: 'S9 (P1): F4–F9 — six plugins get a real `OptionsSchema` (search/docs/deps/git/web-fetch/proposals)`' }
    - { agent: implementation_runner, task: 'S10 (P1): CONC-1 — `agent-worktree-engine.ts` coordinator with syncProposalRegistry (D)' }
    - { agent: implementation_runner, task: 'S11 (P1): CONC-2 — `scaffold-tool.ts` transactional batch writer (S + D)' }
globalGate: validate
acceptance:
    - { command: bun run typecheck,                 expect: exit0 }
    - { command: bun run test,                      expect: exit0 }
    - { command: bun run lint:proposals,            expect: exit0 }
    - { command: bun run lint:tools,                expect: exit0 }
    - { command: bun run validate,                  expect: exit0 }
---

# r00003 — Apply SOLID to the a00036 findings

## Goal

Convert the 21 findings of [`a00036`](docs/proposals/done/audits/a00036-23-06-2026-copilot-minimax-m3-repositorio.md)
(score 5.9/10) into actionable SOLID refactors, **scoped to the code areas
that actually violate a SOLID principle**. Findings that are pure i18n, docs
drift, or test-coverage debt are NOT in this proposal — they belong to
f00050 (quick-wins) or a separate coverage proposal.

This proposal covers **16 of the 21 findings** (the SOLID-applicable subset)
across **11 slices** ordered by priority. Slices are file-disjoint so two
agents can claim two slices in parallel.

## Why

A pure-code SOLID analysis of a00036 produced:

- **5 P0 refactors** (each fixes a FATAL or MUY MAL with <60 LOC of churn and
  immediate value).
- **11 P1 refactors** (each fixes a MEJORABLE / latent risk; grouped in
  bundles of related files so we minimize blast radius).
- **3 "no-SOLID" findings** in a00036 (F-004 doc drift, F-005 i18n tabs,
  WEB-01/02 i18n) — explicitly out of scope here.
- **4 docs/skills findings** (SK-01/02/03) — out of scope, belong to f00050.

Each slice below names the SOLID principle(s) it satisfies and the file:line
where the change happens. No slice changes observable behaviour without a
matching test in the same slice.

## Non-goals

- **No mass refactor of files not implicated by a00036.** This proposal
  stays surgical.
- **No rename of public APIs.** All renames keep `public/index.ts` barrels
  byte-equivalent; `@deprecated` aliases are added where downstream consumers
  could break.
- **No changes to the audit toolchain.** `a00036` stays valid; this
  proposal only closes the findings it lists.
- **No retroactive cleanup of biome warnings.** Biome errors are not in
  scope; they belong to a separate `chore:` PR.
- **No new dependencies.** Refactors use only what the repo already
  imports.

## architecture

> Coordination with the parallel agent mid-flight on F1 — read this first.

A **parallel agent** is already mid-flight on a SOLID refactor of
[`plugins/proposals/src/lib/agents/loop-detector-service.ts`](plugins/proposals/src/lib/agents/loop-detector-service.ts).
Their working tree (uncommitted, unmerged) contains:

- A new file `plugins/proposals/src/lib/agents/loop-detector-config.ts`
  that extracts config resolution (SRP), injects `IConfigFileReader`
  (DIP), and exposes `createFsConfigFileReader()` (LSP).
- A partial edit of `loop-detector-service.ts` that imports the new
  module and removes the inline config block.
- A change to `proposal-glossary.constant.ts` adding a `plan` kind.

**Implication for this proposal**:

- **S6 (F1 partial)** is gated on their commit landing. We do NOT
  re-implement their split. After their work merges, S6 only closes
  the residual hot-path sync I/O on lines 513-514 of
  `loop-detector-service.ts` that the parallel agent did not touch.
- The `proposal-glossary.constant.ts` `plan` kind is out of this
  proposal's scope.
- The other P0/SOLID findings (S1-S5) are in **disjoint files**, so
  we proceed independently while they finish.

## Slices

### S1 — `assemble.ts` blueprint write goes through a durable once-only primitive (F-002)

- **Files**: [`packages/core/src/lib/cli/assemble.ts`](packages/core/src/lib/cli/assemble.ts) (lines 485-503),
  new `packages/core/src/lib/shared/blueprint-store.ts`.
- **SOLID**: S (assemble no longer mixes analysis + idempotency policy +
  persistence); D (depends on `BlueprintStore` abstraction).
- **Status**: done.
- **Gate**: `bun run test` (token-budget e2e + assemble spec).
- **Acceptance**:
  - The TOCTOU race in `prepareServerBlueprintOnStart` is gone: the new
    `BlueprintStore.writeOnce()` holds a process-level mutex
    (`withFileMutex` from `packages/core/src/lib/shared`) and writes via
    `writeFileAtomic`.
  - `assemble.ts:485-503` is reduced to a 5-line call.
  - Existing assemble spec still passes; a new spec
    `blueprint-store.spec.ts` covers: (a) two concurrent writes, (b)
    pre-existing blueprint is preserved, (c) corrupt blueprint is
    quarantined.

### S2 — `cli/server-args.ts` flags forwarding by declarative table (F-001)

- **Files**: [`packages/cli/src/lib/server-args.ts`](packages/cli/src/lib/server-args.ts),
  new `packages/cli/src/lib/server-args.mapper.ts`.
- **SOLID**: O (extension by data, not by `if`s); I (small mappers per
  concern: identity, plugins/preset, observability, bootstrap).
- **Status**: done.
- **Gate**: `bun run test` (parser + new mapper spec).
- **Acceptance**:
  - `buildServerArgs` reads from `SERVER_ARG_MAPPER` table; adding a
    new flag is a one-line table entry, not a new `if`.
  - All 13 globals from `packages/core/src/lib/plugins/parse-cli-args.ts`
    are covered by the table (verified by a "missing-flag" test that
    fails if any known global is dropped).
  - The new mapper file exports `IAutoForwardRule` discriminated by
    `kind: 'flag' | 'option' | 'repeatable' | 'passthrough'`.

### S3 — `fs-tools.ts` removes `atomic: false` from the public tool surface (F-003)

- **Files**: [`packages/core/src/lib/shared/fs-tools.ts`](packages/core/src/lib/shared/fs-tools.ts#L96).
- **SOLID**: L (substitutability: the public tool contract does not
  expose a variant that breaks durability); I (the public `IFsWriteTool`
  no longer carries an `atomic` option).
- **Status**: done.
- **Gate**: `bun run test`.
- **Acceptance**:
  - The `fs_write` tool input schema does NOT include `atomic`.
  - The internal writer (used by scaffold/migrate scripts) keeps an
    `atomic: boolean` parameter but the public tool strips it.
  - A new test asserts: invoking `fs_write` with `atomic` in the input
    returns a structured `400 invalid-argument` error (not a silent
    pass-through).
  - The `IFsWriteTool` public type shrinks by one property.

### S4 — `extension.ts` runtime handle + real `deactivate()` (EXT-01)

- **Files**: [`extensions/vscode/src/extension.ts`](extensions/vscode/src/extension.ts) (lines 100-226),
  new `extensions/vscode/src/host/runtime-handle.ts`.
- **SOLID**: S (activate composes, deactivate disposes — separate
  responsibilities); D (deactivate depends on `IRuntimeHandle`, not on
  the concrete `vscode.ExtensionContext`).
- **Status**: done.
- **Gate**: `bun run test` (extensions test suite + manual reload check).
- **Acceptance**:
  - `deactivate()` is no longer empty; it delegates to
    `runtimeHandle.disposeAll()`.
  - The status bar item, command subscriptions, the stdio client, and
    the dashboard webview are all registered through
    `runtimeHandle.register(...)`.
  - The new spec
    `extensions/vscode/src/test/runtime-handle.spec.ts` asserts:
    `disposeAll()` disposes every registered item, in reverse
    registration order (LIFO).
  - Manual reload of the VS Code window shows no leaked
    `mcp-vertex` items in the status bar after 5 reloads.

### S5 — `plugin-tool-verify.script.ts` plugin loader via injected root (TS-01)

- **Files**: [`tools/scripts/verify/plugin-tool-verify.script.ts`](tools/scripts/verify/plugin-tool-verify.script.ts) (line 58).
- **SOLID**: D (depends on `IPluginRootResolver`, not on relative paths).
- **Status**: done.
- **Gate**: `bun run test` (lint:tools + manual run).
- **Acceptance**:
  - The relative import `await import(\`../../plugins/${name}/src/index.ts\`)`
    is replaced by a resolver that takes the workspace root as an
    argument (`--workspace=...` is already a CLI flag, reuse it).
  - The script can now be invoked from any cwd, not only from
    `tools/scripts/verify/`.
  - A spec verifies the resolver rejects a path outside the workspace
    (`resolveWorkspaceContained`).

### S6 — `loop-detector-service.ts` residual hot-path sync I/O (F1 partial)

- **Files**: [`plugins/proposals/src/lib/agents/loop-detector-service.ts`](plugins/proposals/src/lib/agents/loop-detector-service.ts) (lines 513-514).
- **SOLID**: D (no more direct `node:fs` in the hot path).
- **Status**: done. The parallel-agent F1 refactor (commit `410131b`,
  "update loop detector config to use async file reading") already
  replaced the residual `existsSync`/`readFileSync` on lines 513-514 with
  `await readFile`; the only remaining sync method (`isAgentStuck`) is the
  documented core-contract exception backed by the `lockCache` TTL, not an
  I/O call. Per this slice's own escape clause ("if the parallel agent's
  refactor already covers 513-514, this slice collapses to verify the gate
  — no code change") S6 is closed by gate verification: `grep` confirms no
  sync FS calls remain and all 36 loop-detector specs pass.
- **Gate**: `bun run validate`.
- **Acceptance**:
  - Lines 513-514 (and any other remaining `existsSync`/`readFileSync` in
    the file) are replaced by calls on an injected `IAgentLockReader`.
  - The default production `IAgentLockReader` is async (`await readFile`).
  - The `loop-detector-service.spec.ts` already covers the happy path;
    a new spec asserts: when the injected reader rejects, the detector
    surfaces a structured `degraded: true` signal instead of a sync
    throw.
  - If the parallel agent's refactor already covers 513-514, this slice
    collapses to "verify the gate" — no code change.

### S7 — `proposal-scaffold-linter.ts` removes host-specific narrative from runtime (F2)

- **Files**: [`plugins/proposals/src/lib/proposals/proposal-scaffold-linter.ts`](plugins/proposals/src/lib/proposals/proposal-scaffold-linter.ts) (line 124),
  new `plugins/proposals/src/lib/proposals/proposal-narrative-patterns.ts`.
- **SOLID**: S (linter validates structure, not history); O (new
  patterns extend by data); D (depends on `INarrativePatternProvider`,
  defaults to a host-configurable list).
- **Status**: pending.
- **Gate**: `bun run test`.
- **Acceptance**:
  - The hardcoded array (with `copilot · minimax-m3`, `mcp-vertex`, etc.)
    moves to a separate module that takes the patterns from
    `ctx.options.proposalNarrativePatterns` or from a default empty
    list (the host injects what it needs).
  - The structural lints (frontmatter shape, slice ids, etc.) stay
    inline.
  - A new spec asserts: a default config produces a passing linter on
    a00036 (which would otherwise trigger the host-narrative rules).

### S8 — `chat-titling-reminder.ts` host/version-agnostic reminder (F3)

- **Files**: [`plugins/proposals/src/lib/swarm/chat-titling-reminder.ts`](plugins/proposals/src/lib/swarm/chat-titling-reminder.ts) (lines 149, 168),
  new `plugins/proposals/src/lib/swarm/host-capabilities.ts`.
- **SOLID**: O (new hosts extend by registering a `IHostCapabilities`
  entry); D (depends on capabilities, not on hardcoded literals).
- **Status**: pending.
- **Gate**: `bun run test`.
- **Acceptance**:
  - The hardcoded string ("VS Code 1.123 / Copilot Chat 0.43") is
    replaced by a templated message built from detected
    `IHostCapabilities`.
  - The default capabilities are `{ hostKind: 'ide', renameable: false }`
    with a generic instruction; hosts register concrete capabilities
    via `ctx.options.hostCapabilities` if they want richer text.
  - A new spec verifies: default config produces no host name leak.

### S9 — six plugins get a real `OptionsSchema` (F4–F9)

- **Files**:
  - [`plugins/search/src/index.ts`](plugins/search/src/index.ts) (line 17)
  - [`plugins/docs/src/index.ts`](plugins/docs/src/index.ts) (line 17)
  - [`plugins/deps/src/index.ts`](plugins/deps/src/index.ts) (line 21)
  - [`plugins/git/src/index.ts`](plugins/git/src/index.ts) (line 25)
  - [`plugins/web-fetch/src/index.ts`](plugins/web-fetch/src/index.ts) (line 28)
  - [`plugins/proposals/src/index.ts`](plugins/proposals/src/index.ts) (line 124) — add `proposalFolders` to schema
- **SOLID**: O (new options extend the schema, not the cast); L
  (configured and validated plugins are the same contract); I (each
  plugin's schema is its own narrow interface, not a `Record<string, unknown>`).
- **Status**: pending.
- **Gate**: `bun run test` + `bun run lint:proposals`.
- **Acceptance**:
  - Each plugin declares `optionsSchema: z.object({ ... })`.
  - The `as { ... }` casts are gone.
  - `mcp-vertex.config.json` of this repo still validates with no
    changes (the new schemas are supersets of the consumed options).
  - For `proposals`, `proposalFolders` and `proposalNarrativePatterns`
    (S7) are both in the schema.
  - A spec per plugin verifies: an invalid option fails `safeParse`
    before `register()` is called.

### S10 — `agent-worktree-engine.ts` coordinator with syncProposalRegistry (CONC-1)

- **Files**: [`plugins/proposals/src/lib/agents/agent-worktree-engine.ts`](plugins/proposals/src/lib/agents/agent-worktree-engine.ts) (line 172),
  new `plugins/proposals/src/lib/agents/worktree-sync-coordinator.ts`.
- **SOLID**: D (depends on `IWorktreeSyncCoordinator`, not on raw git +
  registry); S (engine focuses on git worktree mechanics).
- **Status**: pending. **Interacts with `u00002`**: if the worktree
  flag is in `false` in this repo, this slice is still relevant for
  hosts that opt in.
- **Gate**: `bun run test`.
- **Acceptance**:
  - The engine no longer calls `git worktree add` directly; it asks
    the coordinator, which (a) takes the registry mutex first, (b)
    invokes git, (c) releases.
  - A new spec asserts: concurrent `git worktree create` and
    `syncProposalRegistry.run()` are serialized (no stale index read
    mid-worktree-add).
  - The coordinator's default impl is in
    `worktree-sync-coordinator.ts`; tests inject a stub.

### S11 — `scaffold-tool.ts` transactional batch writer (CONC-2)

- **Files**: [`packages/core/src/lib/scaffold/scaffold-tool.ts`](packages/core/src/lib/scaffold/scaffold-tool.ts) (line 276),
  new `packages/core/src/lib/shared/batch-atomic-writer.ts`.
- **SOLID**: S (scaffold plans, batch-writer persists); D (depends on
  `IBatchAtomicWriter`, default impl holds a single mutex for the
  batch).
- **Status**: pending.
- **Gate**: `bun run test`.
- **Acceptance**:
  - The scaffold loop calls `batchWriter.writeAll([{path, content}, ...])`
    which acquires one mutex for the whole batch, writes each file
    atomically, and either commits or rolls back on any failure.
  - A new spec verifies: a write failure in the middle of a batch
    leaves no partial files behind (rollback deletes the ones
    written so far).
  - The single-file path still uses `writeFileAtomic` directly (no
    regression for callers that don't need transactions).

## acceptance

- `bun run validate` is green after every slice merges to `develop`.
- The 5 P0 findings of a00036 (EXT-01, TS-01, F-002, F-001, F-003) are
  closed with code changes that match the SOLID principle stated in
  each slice.
- The 11 P1 findings are closed or moved to a follow-up proposal with a
  link from this one's `## Related`.
- A new audit (next a-NNNN) reports the SOLID score for the affected
  areas at ≥ 8/10.

## Risks

- **Parallel-agent collision on F1**: S6 is gated on their merge. If
  they revert, we ship S6 standalone.
- **`fs-tools.ts` is consumed by scaffold scripts**: removing `atomic: false`
  from the public tool is safe (S3), but any internal caller passing
  it must migrate to the internal writer API.
- **Schema broadening in S9** could surface invalid configs that today
  silently pass via cast. We treat that as the goal, not a risk: every
  surfacing is a bug we are deliberately fixing.

This proposal lives under `ready/` until **all 11 slices are `done`**.
It then moves to `done/refactors/` referencing the merged slice
commits and the `a00036` audit.
