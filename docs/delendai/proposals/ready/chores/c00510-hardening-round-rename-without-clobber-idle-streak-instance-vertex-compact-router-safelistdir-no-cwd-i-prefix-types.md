---
id: c00510
title: "Hardening round: rename-without-clobber, idle-streak instance, vertex→compact_router, safeListDir, no-cwd, I-prefix types"
kind: chore
status: ready
type: proposal
track: unspecified
date: 2026-09-06
priority: P0
related:
    - b00239 # rebrand — `vertex` → `compact_router` migration is the continuation of the rename
    - x00502 # state-engine phase 0.2 internal closure — affected by `I-prefix` migration in core
    - x00503 # nomenclature final polish — set the precedent for hard-cutting legacy ids
    - q00018 # state-engine foundation
    - q00019 # state-engine phase 1 (SQLite) — depends on the purity boundary this proposal establishes
    - r00034 # capabilities — `safeListDir` mirrors the same capability-port pattern
    - c00012 # coexistence with parallel work — multi-agent safety through hooks/leases
---

# c00510 — P0/P1 hardening round (rename-without-clobber, idle-streak instance, vertex→compact_router, safeListDir, no-cwd, I-prefix types)

## Goal

Eliminate the **highest-blast-radius defects** identified by the
2026-09-06 exhaustive audit of `develop`, plus complete the
`vertex` → `compact_router` rebranding that landed the file rename
without finishing the id migration. Five concrete outcomes, all
already implemented and tested:

1. **B1 / `safeRename` primitive** in `@delendai/core/public` —
   replaces every bare `rename()` fallback across the proposals
   plugin. POSIX `rename(2)` atomically REPLACES an existing
   destination, so the previous `git mv` → bare `rename()` fallback
   could silently overwrite a target proposal. `safeRename` rejects
   the clobber with a typed `SafeRenameTargetExistsError`. Three call
   sites migrated: `sync-proposal-registry.moveFile`,
   `proposal-transition.tool.ts`, `recovery-tools.ts`.
2. **B2 / `IIdleStreak` instance** in `auto-work.tool.ts` — replaces
   the module-scope `let consecutiveIdle = 0`. The previous mutable
   global leaked across vitest files and across two `auto_work`
   registrations in the same process, so a burst of empty-fixture
   calls could trip `stop: true` even when the cascade had work.
3. **x00519 / `vertex` → `compact_router` migration** — the
   `compact-router.tool.ts` rename landed in an earlier pass but the
   `id: 'vertex'` / `${prefix}_vertex` registration was preserved
   for backward compatibility. This proposal **removes the legacy
   id entirely** (no soft alias): the router is only registered as
   `delendai_compact_router` now. Every in-tree call site, smoke
   script, measurement harness, and spec was updated; the
   `i18n-english-prose.script.ts` lint was extended with a strict
   `delendai_vertex\b` regression check.
4. **B19 / `safeListDir` primitive** in `@delendai/core/public` —
   replaces the `readdir(...).catch(() => [])` pattern that made
   EACCES / EIO / EMFILE indistinguishable from a truly empty
   directory. 17 plugin call sites migrated (`proposals`, `i18n`,
   `usage-tracking`, `security`, `forge`, `quality`, `diagram`,
   `docs`, `proposals/locks/tmp-file-sweeper`,
   `proposals/migrate-foreign`, `proposals/tools/adopt`,
   `proposals/tools/agents-lock-diagnose`). Each migration makes the
   failure observable (the caller gets `readFailed: true` + the
   original `error`) so a transient permission issue surfaces as a
   `directory-read-failed` incident instead of a silent `0 findings`.
5. **B3 / `process.cwd()` removed from core** —
   `packages/core/src/lib/code-map/generator.ts` previously seeded
   the workspace-root walk from `process.cwd()` at module-load time.
   The replacement uses `import.meta.url` and walks up to
   `delendai.config.json` / `.git`, deterministic regardless of cwd.

A sixth, cross-cutting outcome:

6. **`I-prefix` migration in `tool-outputs.ts`** — `Delendai*Output`
   and `DelendaiToolOutputs` (73 interface / type declarations)
   renamed to `IDelendai*Output` / `IDelendaiToolOutputs` so the
   repo-wide I-prefix convention applies to the generated SDK as
   well. Three consumers updated: `extensions/vscode/src/commands/run-validation.ts`,
   `packages/client/src/lib/services/{metrics,knowledge,agent-catalog}-service.ts`,
   `packages/cli/src/commands/groups/doctor.ts`.

## why

Every item above came out of the 2026-09-06 audit that produced this
proposal. The audit found **0 callers** of the State Engine on disk,
confirmed that `@delendai/state-sqlite` is a future plan, and ranked
the file-system defects with `moveFile` / `consecutiveIdle` /
`process.cwd` as P0, `safeListDir` / I-prefix / vertex-id as P1.

The rename work is not optional. The previous `vertex` / `delendai_vertex`
preserved-id layer created two competing entry points for the same
router. When SQLite lands (q00019), every legacy fallback would have
to be tracked separately — the same anti-pattern the audit calls out
in the SQLite column. Cutting the legacy now is cheaper than cutting
it later.

The `safeListDir` migration is the most cost-effective single
defensive change in the audit. Seventeen `catch(() => [])` sites
became seventeen observable failure paths.

## why this design

- **`safeRename` is a one-line helper** around `access + rename`.
  It deliberately does NOT mkdir the parent directory — that is the
  caller's responsibility (the three callers already do it). It does
  NOT add a mutex either — the cross-process exclusion is the
  caller's `withFileMutex` keyed on the source AND destination paths
  (destination alone is insufficient under the "two agents each
  with their own source racing for the same target" scenario
  surfaced by the audit's concurrency table).
- **`IIdleStreak` is a plain interface** (`{ count, reset,
  increment }`) rather than a class so test fixtures can construct a
  literal in `beforeEach` and observe the same shape `runAutoWork`
  consumes. The production factory `createIdleStreak` keeps the
  field private-via-closure; the interface field is mutable
  (`count: number`, not `readonly`) so the test path does not need
  a `set` method.
- **`safeListDir` returns a tagged union** (`{ entries, readFailed,
  reason, error }`) rather than throwing. The audit called out
  `throw → catch-all → silent `[]`` as the dominant anti-pattern;
  an inline `{ reason: 'read-failed', error }` shape keeps the
  failure visible at every consumer without forcing every caller to
  add a `try/catch`. A companion `safePathExists` helper covers the
  single-file probe that most plugin caches also need.
- **Vertex id retired entirely.** The previous brand preserved a
  legacy alias `delendai_vertex` to keep old hosts working. This
  proposal removes it because: (a) every in-tree caller has been
  updated in this pass; (b) the audit treats legacy aliases as
  exactly the kind of two-truths anti-pattern that SQLite must
  avoid; (c) following the precedent set by x00503's
  `DEFAULT_VERTEX_CONFIG_RULES` rename, retiring at the first
  opportunity is cheaper than tracking compat forever.

## Tasks

### T1 — B1: safeRename primitive + 3 rename() call sites

- **`packages/core/src/lib/shared/safe-rename.ts`** — new file.
  Exports `safeRename(fromAbs, to)` + `SafeRenameTargetExistsError`.
- **`packages/core/src/lib/shared/safe-rename.d.ts`** — generated.
- **`packages/core/src/public/index.ts`** — re-export.
- **`packages/core/tests/src/lib/shared/safe-rename.spec.ts`** —
  5 tests (happy path, clobber refusal, error shape, ENOENT
  propagation, parent-dir caller contract).
- **`plugins/proposals/src/lib/proposals/sync-proposal-registry.ts`**
  — `moveFile` (line 680) uses `safeRename` after `git mv`
  failure; the `reconcileAndArchiveCompletedRootProposals`
  archival (line 406) also migrated to `safeRename` (third `rename()`
  site, distinct critical section).
- **`plugins/proposals/src/lib/tools/proposal-transition.tool.ts`**
  — both `if (!(await isTrackedFile(...))` and `else { … git mv …
  if (!result.ok) }` branches use `safeRename`; collision surfaces
  as a typed error wrapped with the operation context.
- **`plugins/proposals/src/lib/tools/recovery-tools.ts`** — same
  shape, collision wrapped into the recovery error envelope.

### T2 — B2: IIdleStreak instance + test refactor

- **`plugins/proposals/src/lib/tools/auto-work.tool.ts`** — new
  `IIdleStreak` interface + `createIdleStreak()` factory; the
  module-scope `let consecutiveIdle` and `__resetIdleStreakForTesting`
  are gone. `IAutoWorkToolOptions` gains `idleStreak?: IIdleStreak`;
  `buildAutoWorkRegistration` creates one and passes it back.
- **`plugins/proposals/tests/src/lib/auto-work.spec.ts`** — three
  `beforeEach` blocks construct a fresh `{ count, reset, increment }`
  literal instead of calling `__resetIdleStreakForTesting()`.

### T3 — x00519: vertex → compact_router migration

- **`packages/core/src/lib/tools/compact-router.tool.ts`** — the
  handler is extracted into a named `compactRouterHandler(input)`
  factory; the registration only registers `delendai_compact_router`.
  The legacy `delendai_vertex` registration is removed entirely.
- **`packages/core/src/lib/cli/assemble.ts`** — `routerToolId:
  'compact_router'`; the comment block documents the x00519
  precedent (no soft alias).
- **`packages/core/src/lib/surface/decide-mode.ts` (+ `.d.ts`)** —
  comment updated; the duplicate `packages/core/src/src/` tree is
  also updated to mirror the canonical comment but is `.gitignore`d
  (rename artefact).
- **`packages/core/src/generated/tool-outputs.ts`** —
  `DelendaiVertexOutput` → `IDelendaiCompactRouterOutput`;
  `DelendaiToolOutputs` → `IDelendaiToolOutputs`.
- **All consumers** — `extensions/vscode`, `packages/client`,
  `packages/cli`, `tools/scripts/{measure,verify}`,
  `tools/scripts/lint/i18n-english-prose.script.ts`, every spec
  that hardcoded the old id (5 spec files, plus 4 docs files,
  plus the c00160 proposal that referenced the router by old name).
- **`tools/scripts/lint/i18n-english-prose.script.ts`** — the
  `REBRAND_LEFTOVERS` regex now flags any live occurrence of
  `delendai_vertex` or `id: 'vertex'` / `routerToolId: 'vertex'`
  literals; a new exclusion documents the duplicate `src/src/`
  tree (git-ignored noise from the previous rename).

### T4 — B19: safeListDir primitive + 17 readdir.catch call sites

- **`packages/core/src/lib/shared/safe-list-dir.ts`** — new file.
  Exports `safeListDir`, `safeListDirNames`, `safePathExists`,
  `emptySafeListDirResult`, `ISafeListDirResult`, `TSafeListDirEntry`.
  Distinguished reasons: `directory-does-not-exist` (ENOENT),
  `directory-empty`, `not-a-directory` (ENOTDIR), `read-failed`
  (EACCES / EIO / EMFILE / anything else).
- **`packages/core/src/lib/shared/safe-list-dir.d.ts`** — generated.
- **`packages/core/src/public/index.ts`** — re-export.
- **`packages/core/tests/src/lib/shared/safe-list-dir.spec.ts`** —
  11 tests (happy path, empty, ENOENT, relative-path rejection,
  EACCES skipped when uid=0, names convenience, helper factory,
  path-probe kinds, missing path, relative-path rejection).
- **`plugins/proposals/src/lib/proposals/sync-proposal-registry.ts`**
  — `scanNewSystemFiles` + `scanAllProposalIds` (2 sites).
- **`plugins/proposals/src/lib/locks/tmp-file-sweeper.ts`** —
  `listStaleAgentLockTmpFiles`.
- **`plugins/proposals/src/lib/proposals/migrate-foreign.ts`** —
  `collectMarkdown` + `walk` (2 sites).
- **`plugins/proposals/src/lib/tools/adopt.tool.ts`** — `scanDir.walk`.
- **`plugins/proposals/src/lib/tools/agents-lock-diagnose.tool.ts`** —
  `readLatestLogTsByTask`.
- **`plugins/forge/src/lib/git/proposals.ts`** —
  `collectMarkdownFiles`.
- **`plugins/i18n/src/lib/i18n/real-deps.ts`** — `walkWorkspace`
  + `listLocales` (2 sites).
- **`plugins/security/src/lib/sast/runner.ts`** — `walk` (SAST
  walker).
- **`plugins/security/src/lib/sast/stack-detect.ts`** — `walk`.
- **`plugins/usage-tracking/src/lib/services/usage-rollup.service.ts`**
  — `loadDirectoryEntries`.
- **`plugins/usage-tracking/src/lib/rollup.ts`** —
  `loadDirectoryEntries`.
- **`plugins/diagram/src/lib/graph/real-modules.ts`** —
  `listTsFiles.walk`.
- **`plugins/docs/src/lib/tools/docs-generate.tool.ts`** —
  `walkTsFiles`.
- **`plugins/quality/src/lib/tools/quality-complexity.tool.ts`** —
  `walkTsFiles`.

### T5 — B3: process.cwd() removed from core

- **`packages/core/src/lib/code-map/generator.ts`** — `REPO_ROOT`
  now resolves from `fileURLToPath(import.meta.url)` instead of
  `process.cwd()`. The `findWorkspaceRoot` helper walks up to 8
  levels looking for `delendai.config.json` / `.git`, so the
  resolution is deterministic regardless of cwd.
- **`packages/core/src/lib/scaffold/scaffold-host.ts`** — NOT
  modified. The `process.cwd()` reference at line 547 lives inside a
  template literal that is **emitted as a scaffold file** to new
  projects. It is not engine code that runs in the host; it is the
  source content of a generated `server.ts`. Future hardening: emit
  a warning in `delendai init:default` if the generated scaffold
  still contains `process.cwd()`.

### T6 — I-prefix migration in tool-outputs.ts

- **`packages/core/src/generated/tool-outputs.ts`** — 73 type
  declarations renamed from `Delendai*Output` →
  `IDelendai*Output`; the map interface from `DelendaiToolOutputs`
  → `IDelendaiToolOutputs`.
- **`plugins/memory/src/generated/tool-outputs.ts`** — same
  rename (18 declarations).
- **`packages/core/src/contracts/index.ts`** — re-export updated.
- **`packages/client/src/lib/services/metrics.service.ts` +
  `knowledge.service.ts` + `agent-catalog-service.ts`** —
  imports updated.
- **`packages/cli/src/commands/groups/doctor.ts`** — comment
  updated.
- **`extensions/vscode/src/commands/run-validation.ts`** — import
  + use sites updated.

## Acceptance

- `bun run typecheck` exits 0 (was failing at the start of this
  session on the `DelendaiToolOutputs` rename + `IIdleStreak.count`
  readonly + `safeRename` override missing).
- `bun run --filter @delendai/core test` — `safe-rename.spec.ts`
  (5 tests) + `safe-list-dir.spec.ts` (11 tests) both green.
- `bun test plugins/proposals/tests/src/lib/auto-work.spec.ts` —
  31 tests green (the `IIdleStreak` instance refactor preserves the
  "3 idle → stop" behaviour the test suite pins).
- `bun tools/scripts/lint/i18n-english-prose.script.ts` — 0
  violations; the new `delendai_vertex\b` regression check flags
  any future regression.
- No bare `process.cwd()` in `packages/core/src/**` engine code
  (the scaffold-template literal in `scaffold-host.ts` is
  documented as out of scope for this slice).
- No `readdir(...).catch(() => [])` in plugin source code outside
  of a deliberately documented exception (the audit found 17, this
  proposal migrated all 17).

## Out of scope

- The `@delendai/state-sqlite` package — that is q00019.
- The `IHydrateFailureReason` fail-closed extension — that is a
  separate proposal (the contract change is required before the
  SQLite driver can be authored).
- The `state-engine-purity.script.ts` lint + baseline — that is a
  separate proposal (it depends on the fail-closed contract
  extension being agreed first).
- The 13 additional P1/P2 audit findings (B4 / B5 / B6 / B7 / B8 /
  B9 / B10 / B11 / B12 / B13 / B14 / B15 / B21) — each will spawn
  its own slice proposal so the multi-agent cascade can claim them
  in parallel under the per-file lock discipline.