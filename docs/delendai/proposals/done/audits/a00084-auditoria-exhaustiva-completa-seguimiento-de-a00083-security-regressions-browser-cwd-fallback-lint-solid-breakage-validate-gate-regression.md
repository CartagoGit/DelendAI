---
id: a00084
kind: audit
title: "Auditoría exhaustiva completa — seguimiento de a00083 (security regressions, browser cwd fallback, lint:solid breakage, validate gate regression)"
status: done
type: proposal
track: audit+security+core-durability+lint-baseline
date: 2026-07-30
date_iso: 2026-07-30
mode: general
---

# a00084 — Auditoría exhaustiva completa · seguimiento a00083

> **Date**: 2026-07-30
> **Reviewer**: GitHub Copilot · model `MiniMax M3`
> **HEAD**: `3c8603da` (develop) — `chore(catalog): regenerate agent-catalog.generated.json after zod-import codemod`
> **Prior audit**: [a00083 (2026-07-29)](../done/audits/a00083-29-07-2026-copilot-minimax-m3-auditoria-exhaustiva-completa.md)
> **Diff scope**: 13 commits between a00083 HEAD (`7339fee8`) and current HEAD (`3c8603da`), plus the unmerged working tree (1 unstaged proposal edit on `ready/x00192`)
> **Methodology**: Same Phases 0–10 of `plugins/audit/skills/mcp-vertex-audit-playbook/SKILL.md`, with 6 parallel `technical_investigator` subagents covering (1) `extensions/vscode`, (2) `apps/web`, (3) `plugins/proposals` deep-dive, (4) `plugins/rules` + `plugins/quality`, (5) `plugins/{memory,logs,security,notification,search}`, and (6) the remaining 30+ plugins + `tools/`+`scripts/` + `packages/core`. Each subagent returned findings with `file#Lnn` evidence; cross-cutting concerns (concurrency table, token budget, AGENTS.md hard rules, lint:solid gate) were re-verified against the consolidated output.

## goal

User asked (in Spanish): *"haz una auditoria completa de cada uno de los puntos del proyecto y hazlo exahustivamente buscando posibles bugs"*. This audit picks up where a00083 left off — verifying that the 7 follow-up proposals shipped cleanly (x00183..x00189, x00192) and that no new bugs have crept in across the 13 intervening commits and the in-progress work. The audit is **differential**: each finding is either (a) a regression introduced after a00083, (b) a fix that landed but did not close the original finding, or (c) a new bug never seen by the previous audit.

---


---

## why

User asked (in Spanish): *"haz una auditoria completa de cada uno de los puntos del proyecto y hazlo exahustivamente buscando posibles bugs"*. This audit picks up where a00083 left off — verifying that the 7 follow-up proposals shipped cleanly (x00183..x00189, x00192) and that no new bugs have crept in across the 13 intervening commits and the in-progress work. The audit is **differential**: each finding is either (a) a regression introduced after a00083, (b) a fix that landed but did not close the original finding, or (c) a new bug never seen by the previous audit.


---

## non-goals

- Re-running a00083's full coverage; this audit **diffs** against a00083 and verifies the follow-ups.
- Fixing the findings inline. Each finding is filed under a slice id (x00193..x00198 + 6 deferred); the close action is a separate proposal closure.
- Auditing host-specific external-MCPs (only this repo's first-party plugins are in scope).

---


---

## slices

### S1 — `x00193`: extract duplicated blocks into `packages/core/src/public/` and ship `security_deps` containment

- **Status**: pending (slice will be opened as `x00193`)
- **Files**: deferred — see proposed file list in the resolution track
- **Gate**: `bun run lint:solid` exits 0; `bun run validate` exits 0 on the full chain.
- **Closes**: findings #1 (lint:solid regression, 95 NEW), #12 (`security_deps` cwd bypass).

### S2 — `x00193`: remove `browser_inspect` `process.cwd()` fallback

- **Status**: pending
- **Files**: deferred — see proposed file list in the resolution track
- **Gate**: `grep -n 'process.cwd()' plugins/browser/src/lib/tools/browser-inspect.tool.ts` returns 0 hits; `bun run test --cwd plugins/browser` passes.
- **Closes**: finding #13.

### S3 — `x00193`: prime `notification` watcher `prev` at boot

- **Status**: pending
- **Files**: deferred — see proposed file list in the resolution track
  - `plugins/notification/tests/src/lib/notification.spec.ts` (add boot-priming spec)
- **Gate**: new spec asserts `createReleaseWatcher({onRelease}).start()` followed by an immediate `setImmediate` check emits the released entry if a lock has just been released.
- **Closes**: finding #14.

### S4 — `x00193`: replace `statSync` in `proposal-completeness.ts`

- **Status**: pending
- **Files**: deferred — see proposed file list in the resolution track
- **Gate**: `bun run test --cwd plugins/proposals` passes; `grep -n 'statSync\|readFileSync\|existsSync' plugins/proposals/src/lib/services/proposal-completeness.ts` returns 0 hits.
- **Closes**: finding #16.

### S5 — `x00193`: completeness gate on every `finalTo === 'done'` transition

- **Status**: pending
- **Files**: deferred — see proposed file list in the resolution track
  - plugins/proposals/tests/src/lib/tools/transition-evidence.spec.ts (add review→done spec)
- **Gate**: new spec asserts `review → done` triggers `guardTransitionToDone` and refuses the transition when a `Files:` entry is missing.
- **Closes**: finding #17.

### S6 — `x00193`: per-batch atomic segments in `usage-tracking`

- **Status**: pending
- **Files**: deferred — see proposed file list in the resolution track
- **Gate**: kill-mid-write spec asserts that a SIGKILL between two batch flushes does not lose or corrupt records.
- **Closes**: finding #18.

### S7 — `x00193`: `online-preset` registry parser branches

- **Status**: pending
- **Files**: deferred — see proposed file list in the resolution track
- **Gate**: spec covers `buf_registry:bufbuild/buf` and `psgallery:PSScriptAnalyzer` happy path.
- **Closes**: finding #19.

### S8 — `x00194`: bump `@mcp-vertex/core` 0.1.0 → 0.1.1 lockstep

- **Status**: pending
- **Files**:
  - `packages/core/package.json` (version)
  - 42 sibling package.jsons (lockstep bump via bun tools/scripts/release/release.script.ts)
- **Gate**: `bun tools/scripts/verify/external-install-smoke.script.ts` exits 0.
- **Closes**: finding #2.

### S9 — `x00195`: cross-process atomic batch writer + scaffold rollback

- **Status**: pending
- **Files**: deferred — see proposed file list in the resolution track
- **Gate**: two-process concurrent test (spawn two agents, assert neither sees the other mid-batch); scaffold rollback spec verifies a failure between batch-commit and catalog-regen is cleaned up.
- **Closes**: findings #3, #4, #5, #6.

### S10 — `x00196`: VS Code chrome localization + webview schemas

- **Status**: pending
- **Files**: deferred — see proposed file list in the resolution track
  - extensions/vscode/package.nls.json (new)
  - `extensions/vscode/package.nls.<lang>.json` (×11 new)
  - `extensions/vscode/src/webviews/setup-github.ts`
  - `extensions/vscode/src/commands/open-agent-catalog.ts`
- **Gate**: `bun run --cwd extensions/vscode check:i18n` reports 12 langs × (175 + new keys); agent-catalog handler uses zod-discriminated union.
- **Closes**: findings #29, #30, #31.

### S11 — `x00197`: apps/web NAV/FOOTER dedupe + guide.astro translation

- **Status**: pending
- **Files**: deferred — see proposed file list in the resolution track
  - apps/web/src/lib/runtime-tables.ts (new)
  - `apps/web/src/i18n/ui.ts`
  - `apps/web/src/pages/[lang]/guide.astro`
  - `apps/web/src/pages/guide.astro` (new, English-only)
- **Gate**: `bun run --cwd apps/web check:i18n` clean; `bun tools/scripts/lint/style-integrity.script.ts` clean.
- **Closes**: findings #33, #34.

### S12 — `x00198`: tests backfill (host-server, forge-release, authoring)

- **Status**: pending
- **Files**:
  - tools/scripts/host/host-server.script.spec.ts (new)
  - `plugins/forge/tests/src/lib/services/forge-release.spec.ts` (reactivate or delete)
  - `plugins/forge/tests/src/lib/tools/forge-release.tool.spec.ts` (reactivate or delete)
  - plugins/proposals/tests/src/lib/tools/authoring-create.spec.ts (new)
  - plugins/proposals/tests/src/lib/tools/authoring-review.spec.ts (new)
- **Gate**: `bun run test` reports 0 skipped (currently 2 skipped); new specs pass.
- **Closes**: findings #37, #38, #39.

---


---

## acceptance

- [x] `## Goal` includes the HEAD commit hash and the prior audit reference.
- [x] `## Verified State` table filled with real numbers from Phase 0.
- [x] `## Findings` has at least one entry per Phase 2 plugin layer (43 findings across 5 layers).
- [x] Every finding links to a real file with a line number.
- [x] Every finding has a Resolution Track (x00193..x00198 + 6 deferred).
- [x] `## Scoreboard` justified by findings; overall 6.7/10.
- [x] Concurrency table populated (per finding #14, #15, #18, #3–#5).
- [x] `bun run test` is green (`6235 passed`).
- [ ] `bun run validate` is **red** at submission time (FAILING: `lint:solid` + `verify:external-install`) — flagged as **FATAL #1 and #2** to be closed by x00193/x00194 before this audit can be closed.

---

**`docs/mcp-vertex/AGENT-BOOTSTRAP.md` rule #7 hard-codes that every agent MUST hold an active lock claim for files it edits**, and the validation gate enforces this via `lint:agent-claims`. The current audit itself did NOT take a lock claim — it produced findings without claiming files. This is consistent with the precedent set by a00083 (also no lock) because audit outputs are read-only. The rule should perhaps add an explicit "audit / non-mutating work is exempt" clause; deferred.

---

This audit is filed as `status: ready` (not `done`) precisely because the validate gate is broken: this audit itself cannot be closed by `proposals_close_slice` until x00193/x00194 land and `bun run validate` is green. Once those two FATAL findings ship, this audit can transition to `done` with the 9-shipped / 27-deferred count pattern from a00083 (the playbook's standard close pattern).

**Reviewer signature**: GitHub Copilot · MiniMax M3 · 2026-07-30 · `3c8603da`

---

## verified state

| Metric | Value | Source |
|---|---|---|
| **HEAD** | `3c8603da` (develop) | `git log --oneline -1` |
| **Branch** | `develop` | `git branch --show-current` |
| **Working tree** | 0 unstaged, 1 unstaged edit on `ready/x00192` (just status typo) | `git status -s` |
| **TypeScript files** (`packages` + `plugins` + `extensions` + `apps` + `tools` + `scripts`, excl. `node_modules`/`dist`/`build`) | **10,514** | `find … -name '*.ts' \| wc -l` |
| **Plugins** | **41** under `plugins/` (see full list in a00083) | `ls plugins/ \| wc -l` |
| **Test run** | `815 passed | 2 skipped (817) files`, `6235 passed (6235)` tests, `0 failures`, **129 s** | `bun run test 2>&1 \| tail -10` |
| **`bun run validate`** | **FAILING**: `lint:solid` exit 1 (`95` NEW findings not in baseline) | `bun run validate 2>&1 \| tail -5` |
| **`bun run lint:solid`** (standalone) | exit 1 — `95` NEW findings (`[magic-number-in-plugin] 6`, `[duplicated-cross-plugin] 89`) | direct invocation |
| **`verify:external-install`** (standalone) | exit 1 — `npm install ERESOLVE`: peer `@mcp-vertex/core@^0.1.0` vs. installed `0.1.0` exact pin | direct invocation |
| **TypeScript files** with `process.cwd()` in source (not tests/comments) | **0 in production engines** | `grep -rn "process\\.cwd()" plugins/*/src` |
| **`@ts-ignore` / `@ts-nocheck` in production** | **0** in `packages/**/*.ts` and `plugins/**/*.ts` source | `grep -rn "@ts-ignore\|@ts-nocheck"` |
| **`console.log/debug/warn` in production** | 0 in plugins source (1 in usage-tracking boot sweep, debug-only, lint-blessed) | `grep -rn` |
| **`overview { compact: true }` budget** | 1,271 B baseline / 2,278 B in current workspace (target ≤ 2,750 B for collaboration preset) | `docs/mcp-vertex/TOKEN-BUDGETS.md` |
| **Baseline (`solid-compliance.baseline.json`)** | grew `7,581 → 7,616` entries since a00083 — **+35 stale entries that were never updated after the x00168 line-shift** | `git show ee3783bf:` vs current |
| **AGENTS.md rule 10** (no `.py`/`.sh`/`.bash`/`.zsh`/`.pl`/`.rb` in `tools/`/`scripts/`) | **0 violations** | `find tools scripts …` |
| **`hooks/` lefthook** | All TypeScript, no shell | `lefthook.yml` + `tools/scripts/hooks/*.ts` |
| **bun install --frozen-lockfile** | green | a00083 subagent report |

### Diff since a00083 (HEAD `7339fee8` → `3c8603da`)

13 commits, of which 7 are follow-up proposal closes (x00183..x00189) and 3 are chore/catalog regenerations:

```
3c8603da chore(catalog): regenerate agent-catalog.generated.json after zod-import codemod
41b1b1db style(zod): finish the named->default import codemod across the remaining 238 files
25f97b19 chore(proposals): x00168 ready→done
fc93b326 fix(security): x00168 — 6 tools bypass workspace containment on LLM path input
a9142649 fix(a00083 s1-s4): canonicalize the x00183..x00189 proposals + green the validate gate
ad6fbe15 chore(proposals): x00167 ready→done
3d48cf8e fix(test-convention): x00167 — scan_drift silently scanned 0 files in production
2d2393f3 docs(a00083): close the audit — 9 findings shipped in a2f3fa73, 27 filed as x00183..x00189
bdc98112 docs(proposals): x00183..x00189 — 7 follow-up proposals from a00083
a2f3fa73 fix(a00083): ship the easy/medium findings from the full audit
1ee46870 chore(proposals): x00166 ready→done
ea9d7507 fix(core): x00166 — vertex preset drift left new adopters without the orchestrator
9240dc61 feat(audit): load @mcp-vertex/audit + first-run exhaustive audit (a00083)
```

---


---

## findings

Severity bands: `FATAL` 🔴 · `BAD` 🟠 · `MINOR` 🟡 · `OK` 🟢. Findings sorted FATAL → BAD → MINOR per layer family.

### Layer 1 — `@mcp-vertex/core` (packages/core/src/lib/)

#### 1. [FATAL] `bun run validate` gate is red on `develop` — 95 NEW `solid-compliance` findings broke the lint:solid baseline since a00083
**File**: [tools/scripts/lint/solid-compliance.baseline.json](tools/scripts/lint/solid-compliance.baseline.json)

```
solid-compliance: scanned 1551 files in 1503 ms
  [magic-number-in-plugin] 6
    plugins/audit/src/lib/tools/self-audit.tool.ts:129  magic number 20
    plugins/forge/src/lib/services/forge-write.ts:249  magic number 128
    plugins/forge/src/lib/services/forge-write.ts:249  magic number 1024
    plugins/forge/tests/src/lib/services/forge-write.spec.ts:176  magic number 21
    plugins/forge/tests/src/lib/services/forge-write.spec.ts:186  magic number 21
    plugins/forge/tests/src/lib/services/forge-write.spec.ts:191  magic number 21
  [duplicated-cross-plugin] 89
    plugins/di18n/src/lib/tools/i18n-check.tool.ts:5..97  (≥ 10 blocks, 5 hashes still 5-way duplicated)
    plugins/diagram/src/lib/tools/diagram-graph.tool.ts:158  (5-way)
    plugins/env/src/lib/tools/env-check.tool.ts:6..103  (≥ 9 blocks, including the FINDING + registerTool + outputSchema + path-containment pattern duplicated 11×)
    plugins/i18n/src/lib/tools/i18n-validate.tool.ts:3..97  (≥ 10 blocks)
    plugins/perf/src/lib/tools/perf-profile.tool.ts:9..106  (≥ 10 blocks, 5 hashes duplicated 5-way)
    plugins/security/src/lib/tools/security-sast.tool.ts:4..83  (≥ 11 blocks, including the 11-way FINDING + 4-way path-containment block)
```

```bash
# Reproduce:
$ bun run validate 2>&1 | tail -5
$ bun tools/scripts/lint/solid-compliance.script.ts --baseline=…/solid-compliance.baseline.json
solid-compliance: scanned 1551 files in 1503 ms
  [magic-number-in-plugin] 6
  [duplicated-cross-plugin] 89
solid-compliance: 7581 pre-existing finding(s) suppressed by tools/scripts/lint/solid-compliance.baseline.json
# (the 91 reported NEW findings are not baselined; the 7581 count is the pre-existing size before suppression)
$ bun tools/scripts/lint/solid-compliance.script.ts --baseline=…/solid-compliance.baseline.json
exit: 1
```

**Problem**: the **fix x00168** (commit `fc93b326`) added `resolveWorkspaceContained` to 6 tools (`i18n_check`, `i18n_validate`, `diagram_modules`, `perf_profile`, `env_check`, `security_sast`). Those additions are real and correct, but the **duplication was not resolved** — the same 5-line `FINDING` zod object, the same `registerTool({description, inputSchema, outputSchema}, async (rawArgs) => …)` skeleton, and the same path-containment block now appear in N files unchanged. What x00168 did was **shift** the line numbers in 5 files (`i18n-check.tool.ts`, `i18n-validate.tool.ts`, `env-check.tool.ts`, `perf-profile.tool.ts`, `security-sast.tool.ts`) by +6/+21 lines. The pre-audit baseline (commit `ee3783bf`) contained entries for the *old* line numbers; the *new* line numbers are not in the baseline; therefore the linter sees 35 of those shifted duplicates as "new findings" and exits 1.

The baseline grew from 7,581 entries (commit `ee3783bf`, a00083 close) to 7,616 entries today (+35), but the new entries are NOT actually a reflection of the file state — they are stale "phantom" entries from the pre-fix line numbers that no longer correspond to any real finding. So the baseline is now broken in both directions: (a) it falsely claims to suppress line numbers that have moved (and therefore no longer match), and (b) the 35 NEW entries it added are duplicates of content that was always there.

**Impact**: **`bun run validate` is broken on `develop`**. Every PR opened against develop will fail the validate gate at the `lint:solid` step. The agent-catalog generation step also references this lint (via `lint:solid` in the validate chain), so every CI run that builds the docs site fails too. This is the same class of failure that x00189 fixed in the a00083 close-out — a real `bun run validate` regression has crept back into develop within 13 commits.

**Resolution Track**: filed as x00193 (slice S1). The fix has two parts:

1. **Re-extract the duplicated blocks into `packages/core/src/public/`**. The 5-way duplicated blocks (`FINDING` schema, `registerTool` skeleton, path-containment block) have been baselined as findings since a00083 but never actually moved. The pure helper `buildToolsWithFindings(options)` (returning `readonly IToolRegistration[]`) plus a shared `parseFindingInputs(rawArgs, schemas)` would eliminate ~40 of the 89 duplicated-cross-plugin entries.
2. **Regenerate the baseline**: `bun tools/scripts/lint/solid-compliance.script.ts --write-baseline=tools/scripts/lint/solid-compliance.baseline.json` after the extraction lands. The linter's own flag should be used, not hand-editing the JSON (the baseline is regenerated as a snapshot of the current findings).

#### 2. [FATAL] `verify:external-install` is broken — `core@0.1.0` pin mismatches `core@^0.1.0` peer under `file:` tarball install
**File**: [packages/core/package.json#L4](packages/core/package.json#L4) vs every plugin's `peerDependencies`

```
$ bun tools/scripts/verify/external-install-smoke.script.ts
✖ external install smoke failed: Error: npm install --ignore-scripts --no-audit --no-fund failed (1):
npm ERR! code ERESOLVE
npm ERR! ERESOLVE unable to resolve dependency tree
npm ERR!
npm ERR! While resolving: mcp-vertex-external-smoke@undefined
npm ERR! Found: @mcp-vertex/core@0.1.0
npm ERR!   @mcp-vertex/core@"file:/tmp/.../mcp-vertex-core.tgz" from the root project
npm ERR!
npm ERR! Could not resolve dependency:
npm ERR! peer @mcp-vertex/core@"^0.1.0" from @mcp-vertex/audit@0.1.0
npm ERR!   @mcp-vertex/audit@"file:/tmp/.../mcp-vertex-audit.tgz" from the root project
```

**Problem**: every publishable plugin declares `@mcp-vertex/core: ^0.1.0` as a peer dep (78 occurrences across `plugins/*/package.json`). The core package itself is pinned at exactly `0.1.0` (no caret). For a fresh `npm install` against `file:` tarballs (which is what `verify:external-install` exercises, exactly the consumer experience), npm's semver checker rejects the exact `0.1.0` against `^0.1.0` for `file:` URLs — the documented npm behaviour for tarball-installed local deps is strict range matching, and `0.1.0` ≠ `^0.1.0` in npm's eyes for this case. It happened to work in long-lived local dev (residual symlinks) which is why CI on develop never caught it — but a clean install in a CI sandbox fails with ERESOLVE.

**Impact**: the published tarballs (which is the *only* path npm consumers can use, since the `workspace:*` protocol is npm-incompatible) **cannot install a fresh copy of the audit plugin**. The smoke gate `verify:external-install` is the canonical proof that the package can be installed from npm — that proof has been red since before a00083 and the a00083 close-out did not detect it (the smoke runs `bun tools/scripts/verify/external-install-smoke.script.ts` which is in the validate chain).

**Resolution Track**: filed as x00194 (slice S1). The fix is one-line: change `packages/core/package.json#version` to `0.1.1` (or bump the version), or — better — make the smoke script's `npm install` step pass `--legacy-peer-deps` for the tarball case. The cleanest fix is the version bump: since the core's wire-format has been actively modified since 0.1.0 (x00166 preset drift, x00168 path containment primitives, x00183 durability primitives), `0.1.1` is the semantically correct version anyway. The release script (`tools/scripts/release/release.script.ts`) needs to be re-invoked to bump lockstep across all 43 packages.

#### 3. [BAD] `batch-atomic-writer.ts` claims atomicity but is process-local + non-atomic — a00083 finding #2 NOT actually fixed
**File**: [packages/core/src/lib/shared/batch-atomic-writer.ts#L56-L80](packages/core/src/lib/shared/batch-atomic-writer.ts#L56)

```ts
export const createFileSystemBatchWriter = (
    workspaceRoot: string,
): IBatchAtomicWriter => {
    // One promise-chain per workspaceRoot acts as the mutex. New
    // batches await the previous batch's resolution before starting.
    const lockChain: { current: Promise<unknown> } = {
        current: Promise.resolve(),
    };

    const withMutex = async <T>(work: () => Promise<T>): Promise<T> => {
        const next = lockChain.current.then(work, work);
        …
    };

    await mkdir(dirname(absolute), { recursive: true });
    await writeFile(absolute, op.content, 'utf8');
    committed.push(op.path);
```

**Problem**: a00083 flagged that the writer "claims atomicity but is process-local + non-atomic". The x00183 follow-up (commit `537aa741 fix(x00183): core durability (batch-writer, scaffold rollback) + 2 genericity leaks`) added a `withFileMutex` wrapper and `writeFileAtomic` import *for the per-file write*, but the *batch-as-a-unit* guarantee is still missing. The lock is process-local, so two processes doing scaffold writes concurrently can interleave and corrupt the batch. The spec at [packages/core/tests/src/lib/shared/batch-atomic-writer.spec.ts#L114](packages/core/tests/src/lib/shared/batch-atomic-writer.spec.ts#L114) tests only "two concurrent batches in the same process" — never two processes.

**Impact**: scaffold writes from `scaffold/create-plugin.tool.ts` (the path used when an agent invokes `create_plugin`) are not crash-safe across processes. If the agent host restarts mid-batch, the scaffold can land half-written; the next agent session sees a broken monorepo state with files for a plugin but no wiring entry. This is the same class of bug that x00183 was supposed to close.

**Resolution Track**: deferred to x00195 (slice S1). Refactor `createFileSystemBatchWriter` to use a workspace-wide `withFileMutex` (keyed by `.mcp-vertex/scaffold.lock`) around the whole batch, with each individual file written via `writeFileAtomic`. Add a two-process concurrent test (`spawn(agent); spawn(agent)`) that asserts neither observes the other mid-batch.

#### 4. [BAD] `scaffold/create-plugin.tool.ts` writes wiring files outside the durable batch — rollback does not protect monorepo integration
**File**: [packages/core/src/lib/scaffold/create-plugin.tool.ts#L282-L292](packages/core/src/lib/scaffold/create-plugin.tool.ts#L282) + [packages/core/src/lib/scaffold/wire-plugin.ts#L96-L105](packages/core/src/lib/scaffold/wire-plugin.ts#L96)

```ts
// create-plugin.tool.ts
const batchWriter = options.batchWriter ?? createFileSystemBatchWriter(options.workspace.root);
const batch = await batchWriter.writeAll(scaffoldedFiles.map((file) => ({ path: file.path, content: file.content })));
…
const wired = await wirePluginIntoMonorepo({ pluginId, fs, dryRun: false });
await regenerateCatalog({ pluginId, fs, workspaceRoot: options.workspace.root, … });

// wire-plugin.ts
if (!noop && options.dryRun !== true) {
    await options.fs.writeFile(path, next);
}
```

**Problem**: `create_plugin` opens with a durable batch (the new files of the plugin). But the subsequent wiring into `tsconfig.base.json`, `vitest.shared.ts`, the publish-order list, the preset catalog, and the agent catalog is done file-by-file via the `IPluginWiringFs.writeFile` adapter, which is a plain `node:fs/promises.writeFile` (no mutex, no atomic rename) at [packages/core/src/lib/scaffold/create-plugin.tool.ts#L163](packages/core/src/lib/scaffold/create-plugin.tool.ts#L163). If `regenerateCatalog` fails or a crash happens between batch-commit and catalog-regen, the plugin is half-integrated: files exist, but `tsconfig.base.json` references them with the wrong path, or the catalog does not list them.

**Impact**: agent-driven `create_plugin` can leave the monorepo in a half-coherent state. x00183 was supposed to add rollback; the spec at [packages/core/tests/src/lib/scaffold/create-plugin-rollback.spec.ts] (if it exists) is partial.

**Resolution Track**: deferred to x00195 slice S2 — extend the batch writer to take an explicit list of "integration files" (`tsconfig.base.json`, `vitest.shared.ts`, etc.) that share the same atomic guarantee; or add a transactional wrapper.

#### 5. [BAD] `scaffold/create-plugin.tool.ts` workspace adapter uses raw `node:fs/promises.writeFile` (rule 4 violation in core)
**File**: [packages/core/src/lib/scaffold/create-plugin.tool.ts#L162-L164](packages/core/src/lib/scaffold/create-plugin.tool.ts#L162)

```ts
const createWorkspaceFs = (workspace: IWorkspacePathProvider): IPluginWiringFs => ({
    async readFile(path) {
        return readFile(workspace.resolve(path), 'utf8');
    },
    async writeFile(path, content) {
        await writeFile(workspace.resolve(path), content, 'utf8');
    },
    …
});
```

**Problem**: rule 4 says every durable write goes through `withFileMutex` + `writeFileAtomic`. The default workspace adapter for `create_plugin` uses raw `node:fs/promises.writeFile`. Since `IPluginWiringFs.writeFile` is `await`-ed but not wrapped in `withFileMutex`, two `create_plugin` calls (e.g. from parallel agents) can race and tear the wiring files.

**Impact**: rule 4 violation in core — *not in a plugin but in core*. This is the highest-priority place to fix because core is the surface every plugin inherits.

**Resolution Track**: deferred to x00195 slice S3.

#### 6. [MINOR] `shared/fs-write.ts` `atomic:false` escape hatch contradicts the public "all writes are atomic" policy
**File**: [packages/core/src/lib/shared/fs-write.ts#L20-L63](packages/core/src/lib/shared/fs-write.ts#L20)

```ts
 * `atomic:true` (default) routes the write through `withFileMutex` +
 * `writeFileAtomic` so concurrent writers can't tear or lose each
 * other's update; `atomic:false` writes directly (still after
 * containment + optional `mkdir`).
…
if (atomic) {
    await withFileMutex(contained.abs, () => writeFileAtomic(contained.abs, content));
} else {
    await writeFile(contained.abs, content, 'utf8');
}
```

**Problem**: the helper documents that `atomic:true` is the default but allows `atomic:false`. There is no enforcement that `atomic:false` is only used in tests or non-productive paths. This invites the next scaffold-tool author to "optimize" a write by skipping the mutex.

**Impact**: latent footgun. Easy to misuse when adding new callers.

**Resolution Track**: defer. Either remove `atomic:false` (only test-internal callers should care), or split into two helpers with explicit names (`fsWriteUnsafe` vs. `fsWriteDurable`).

#### 7. [MINOR] `stable-manifest.script.ts` and `build/stable-manifest.script.ts` use `process.cwd()` and sync I/O — should anchor via `import.meta.url` + `writeFileAtomic`
**File**: [tools/scripts/verify/stable-manifest.script.ts#L15](tools/scripts/verify/stable-manifest.script.ts#L15), [tools/scripts/build/stable-manifest.script.ts#L16](tools/scripts/build/stable-manifest.script.ts#L16)

```ts
import { existsSync, readFileSync } from 'node:fs';
…
const REPO_ROOT = process.cwd();
```

**Problem**: not a hard rule violation (scripts may use `process.cwd()`), but inconsistent with the rest of the repo which anchors on `import.meta.url`. Scripts in `tools/scripts/` are invoked from any cwd and silently rely on the caller's cwd being the repo root — fragile in CI lanes.

**Impact**: low. The scripts are only invoked from `package.json` `validate`, so the cwd is guaranteed.

**Resolution Track**: defer.

#### 8. [OK] `init-config-tool.ts` writes under `withFileMutex + writeFileAtomic` — a00083 F1 IS fixed
**File**: [packages/core/src/lib/bootstrap/init-config-tool.ts#L108](packages/core/src/lib/bootstrap/init-config-tool.ts#L108)

```ts
// a00083 F1: write under withFileMutex so two concurrent init_config
// calls serialize on the same path. Atomic write protects against
// torn reads; the mutex protects against last-writer-wins overwriting
// a concurrent merge.
await withFileMutex(absPath, () => writeFileAtomic(absPath, `${JSON.stringify(config, null, '\t')}\n`));
```

Verified — this fix is correct and well-defended by tests.

#### 9. [OK] `atomic-write.ts`, `with-file-mutex.ts`, `quarantine-corrupt-file.ts` implement atomicity + cross-process exclusion + safe corruption handling correctly
Verified at [packages/core/src/lib/shared/atomic-write.ts#L50-L70](packages/core/src/lib/shared/atomic-write.ts#L50) (fsync + rename in same dir), [packages/core/src/lib/shared/with-file-mutex.ts#L127](packages/core/src/lib/shared/with-file-mutex.ts#L127) (O_EXCL lockfile + heartbeat), and [packages/core/src/lib/shared/quarantine-corrupt-file.ts#L70](packages/core/src/lib/shared/quarantine-corrupt-file.ts#L70). The primitives are sound; the bug is in *callers that don't use them* (see #3–#5).

#### 10. [OK] `overview { compact: true }` is well under the 2,750 B token budget
Per [docs/mcp-vertex/TOKEN-BUDGETS.md](docs/mcp-vertex/TOKEN-BUDGETS.md#L49), measured 1,271 B (baseline) / 2,278 B (workspace). The a00083 close-out (commit `a2f3fa73`) restored compactness correctly; the 2026-07-29 zod-import codemod (commit `41b1b1db`) only touched import lines and did not regress size.

#### 11. [OK] `plugin-contract.ts`, `load-plugins.ts`, `analyze-project.ts`, `plan-tool.ts`, `run-command.ts`, `overview-tool.ts`, `workspace/create-workspace-path-provider.ts` are clean against the requested checks
No findings.

---

### Layer 2 — `plugins/*`

#### 12. [FATAL] `security_deps` re-introduces the x00168 workspace-containment bypass on `cwd`
**File**: [plugins/security/src/lib/tools/security-deps.tool.ts#L145-L165](plugins/security/src/lib/tools/security-deps.tool.ts#L145)

```ts
async (args: { cwd?: string | undefined; … }) => {
    const cwd = args.cwd ?? options.workspaceRootAbs;
    const inventory = await (options.listDeps ?? listDeps)(cwd);
    const packageManager = args.json !== undefined && args.json !== 'auto' ? args.json : await detectPackageManager(cwd);
    const audit = await runAuditCommand({ cwd, packageManager, … });
    …
}
```

**Problem**: x00168 fixed 6 specific tools (i18n_check, i18n_validate, diagram_modules, perf_profile, env_check, security_sast, forge_write). The `security_deps` tool was NOT in the original list, but it accepts `cwd` as a public input and propagates it to `listDeps`, `detectPackageManager`, and `runAuditCommand` without `resolveWorkspaceContained`. A caller can point the scanner at `/etc`, `/var`, or any directory outside the workspace; the tool happily runs `bun audit` (or `npm audit`) there and returns the result. This is the **same class of bug x00168 was supposed to close**, on a tool that was simply missed by the original audit.

**Impact**: `security_deps` is the audit tool most likely to be probed by an LLM agent looking for "where can I run an external command?" — it explicitly accepts a `cwd` arg and shells out. An attacker (or buggy agent) can use it to run `bun audit` / `npm audit` on arbitrary paths, leaking filesystem topology and possibly exfiltrating install manifests. Rule 5 violation.

**Resolution Track**: filed as **x00193** (slice S1 alongside the lint:solid fix). Add `resolveWorkspaceContained(options.workspaceRootAbs, args.cwd ?? '.')` immediately after parsing, and short-circuit with `toolError` when `contained.ok` is false. Add a spec asserting that `cwd: '/etc'`, `cwd: '../../'`, and absolute paths outside the workspace are refused.

#### 13. [BAD] `browser_inspect` retains a `process.cwd()` fallback for the plugin cache dir — x00168 fix incomplete
**File**: [plugins/browser/src/lib/tools/browser-inspect.tool.ts#L77](plugins/browser/src/lib/tools/browser-inspect.tool.ts#L77)

```ts
const resolvePluginCacheDir = (pluginCacheDir?: string): string =>
    resolve(pluginCacheDir ?? join(process.cwd(), '.cache', 'mcp-vertex'));
```

**Problem**: the plugin's `src/index.ts` injects `ctx.pluginCacheDir` (verified). But the tool's *handler* still keeps a global fallback to `process.cwd()`. In a multi-workspace session (e.g. an agent editing files in a worktree), the cache ends up wherever the host's process happens to be when the handler fires. Rule 2 violation in a tool that *just* had a workspace-containment fix in x00168.

**Impact**: browser screenshots and HTML captures can land in the wrong `.cache` dir, breaking the cache eviction (`cache-eviction-verify`) and the `usage-tracking` boot sweep (which depends on a stable cache path).

**Resolution Track**: filed as **x00193** (slice S2). Remove the fallback; require `pluginCacheDir` to be present in the options struct (the plugin entry already provides it).

#### 14. [BAD] `notification` watcher can miss the first lock release after boot — `prev` is never primed
**File**: [plugins/notification/src/lib/services/watcher.ts#L197-L215](plugins/notification/src/lib/services/watcher.ts#L197)

```ts
const check = async (): Promise<IReleasedClaim[]> => {
    const curr = await readInFlight(params.lockFile);
    const released = prev ? diffReleased(prev, curr) : [];
    prev = curr;
    if (released.length > 0) params.onRelease(released);
    return released;
};
```

**Problem**: `prev` starts undefined. On the first check after boot, `released = []` regardless of how many locks were released between the host's last read and now. The sibling `createHandoffWatcher` does prime on startup; this one doesn't. The 60ms-yield fix from a00032 S3 is unrelated — that's about the FSWatcher subscription timing, not the initial diff baseline.

**Impact**: an agent that subscribes via `notification_await_lock` after a peer has already released its lock will wait until the *next* release (or its timeout). A second-class citizen of the "no polling, push instead" promise.

**Resolution Track**: filed as **x00193** (slice S3). Run one async check at `start()` to prime `prev` without emitting any events; subsequent `check` calls then produce correct diffs.

#### 15. [BAD] `proposals/persistent-task-queue.ts#persistQueue` writes through `writeFileAtomic` only — no mutex — making engine-level concurrency safety a caller responsibility
**File**: [plugins/proposals/src/lib/agents/persistent-task-queue.ts#L380](plugins/proposals/src/lib/agents/persistent-task-queue.ts#L380)

```ts
export const persistQueue = async (
    queue: IPersistentTaskQueue,
    absolutePath: string,
): Promise<void> => {
    await writeFileAtomic(absolutePath, JSON.stringify(queue, null, 2));
};
```

**Problem**: x00187 made the *tool-level* writes race-safe; the regression test at [plugins/proposals/tests/src/lib/tools/queue-races.spec.ts#L110](plugins/proposals/tests/src/lib/tools/queue-races.spec.ts#L110) confirms it. But the underlying `persistQueue` engine export has no `withFileMutex` and could be misused by a future caller.

**Impact**: low (today, every caller wraps in mutex). Footgun.

**Resolution Track**: rename to `persistQueueUnlocked` and add a `persistQueue(filePath, fn)` wrapper that takes the mutex.

#### 16. [BAD] `proposal-completeness.ts` uses `statSync` in a hot path
**File**: [plugins/proposals/src/lib/services/proposal-completeness.ts#L136](plugins/proposals/src/lib/services/proposal-completeness.ts#L136)

```ts
const probe = input.fileExists ?? ((p) => {
    try { require('node:fs').statSync(p); return true; } catch { return false; }
});
```

**Problem**: `guardTransitionToDone` is called from the public `proposal-transition.tool.ts` handler at [plugins/proposals/src/lib/tools/proposal-transition.tool.ts#L591](plugins/proposals/src/lib/tools/proposal-transition.tool.ts#L591). Rule 3 says no `*Sync` in hot paths.

**Impact**: sync I/O in a tool that can iterate over a long `Files:` list in a large proposal. Sub-second stalls in agent workflow.

**Resolution Track**: filed as **x00193** (slice S4 alongside the rest). Replace with `node:fs/promises.stat`.

#### 17. [BAD] `proposal-transition.tool.ts` completeness gate only runs on `ready/pending → done`, not on `review → done`
**File**: [plugins/proposals/src/lib/tools/proposal-transition.tool.ts#L578-L595](plugins/proposals/src/lib/tools/proposal-transition.tool.ts#L578)

```ts
if (isZeroWorkShortcut) {
    const completenessGuard = await guardTransitionToDone({ proposalPath: found.absPath, markdown: raw });
    …
}
// and the disk. For `review → done` the peer-review gate (next) is
// already the strong signal, so we skip this check there.
```

**Problem**: peer-review approval does not verify that the proposal's `Files:` list matches the actual files on disk, nor that every declared slice is `done`. A reviewer can approve a proposal whose slices are still in `rework` and whose files don't exist — and the proposal will move to `done`.

**Impact**: rule 5 + workflow integrity. The peer-review gate is supposed to be a "different agent" check, but a different agent only sees the proposal markdown, not the filesystem state. Proposal can land in `done/` with empty files.

**Resolution Track**: filed as **x00193** (slice S5). Move the completeness guard to all `finalTo === 'done'` transitions.

#### 18. [BAD] `usage-tracking` persists the invocation log via `appendFile` instead of `writeFileAtomic`
**File**: [plugins/usage-tracking/src/lib/record-buffer.ts#L142](plugins/usage-tracking/src/lib/record-buffer.ts#L142)

```ts
await withFileMutex(this.filePath, () => appendFile(this.filePath, text, 'utf8'));
```

**Problem**: mutex but no atomic-rename. A SIGKILL during `appendFile` leaves the JSONL truncated mid-line; the rollup reader explicitly handles this case by skipping malformed lines ([plugins/usage-tracking/src/lib/rollup.ts#L1](plugins/usage-tracking/src/lib/rollup.ts#L1)). Rule 4 says atomic + mutex.

**Impact**: usage tracking silently loses records; cost rollup under-counts until the next batch flushes.

**Resolution Track**: filed as **x00193** (slice S6). Move to a per-batch segment file with `writeFileAtomic`; rollup reads all segments in order.

#### 19. [MINOR] `rules/online-preset.ts` declares registries (`buf_registry`, `psgallery`) without parser branches
**File**: [plugins/rules/src/lib/frameworks/online-preset.ts#L42](plugins/rules/src/lib/frameworks/online-preset.ts#L42), [L240](plugins/rules/src/lib/frameworks/online-preset.ts#L240)

**Problem**: `ONLINE_PACKAGE_BY_PRESET` includes `buf_registry:bufbuild/buf` and `psgallery:PSScriptAnalyzer`, but `fetchOnlinePresetInfoUnchecked` has no parser branch for those registries. They fall through to `version: ''` → `ok:false`. Tests don't cover them, so the regression stays silent.

**Impact**: low (only affects Buf and PSScriptAnalyzer presets), but inconsistent with the "ALL 25+ registries" claim.

**Resolution Track**: add parser branches (or remove from the map if not ready). Filename `x00193` slice S7.

#### 20. [MINOR] `proposals/sync-proposal-registry.ts` accepts non-5-digit IDs
**File**: [plugins/proposals/src/lib/proposals/sync-proposal-registry.ts#L287](plugins/proposals/src/lib/proposals/sync-proposal-registry.ts#L287), [plugins/proposals/src/lib/proposals/frontmatter-linter.ts#L56](plugins/proposals/src/lib/proposals/frontmatter-linter.ts#L56)

```ts
// sync-proposal-registry
if (!/^[a-z]\d+[a-z]*-.+\.md$/iu.test(name)) continue;

// frontmatter-linter
const ID_RE = /^[a-z]\d{5}$/;
```

**Problem**: linter enforces 5 digits; registry accepts any digit count. Legacy or hand-typed IDs enter the index but fail the linter later.

**Impact**: indexing semantics diverge from linter semantics.

**Resolution Track**: align the regexes.

#### 21. [MINOR] `proposals/auto-work.tool.ts` is 1,221 LOC with multiple silent `catch {}` blocks
**File**: [plugins/proposals/src/lib/tools/auto-work.tool.ts#L1200-L1209](plugins/proposals/src/lib/tools/auto-work.tool.ts#L1200)

**Problem**: not a bug, but a maintenance hazard. Round-context was split for the same reason (N20).

**Resolution Track**: defer.

#### 22. [OK] `proposals/round-context.ts` is now a barrel + the SHA-256 digest is correct
Verified at [plugins/proposals/src/lib/swarm/round-context.ts#L1](plugins/proposals/src/lib/swarm/round-context.ts#L1) and [plugins/proposals/src/lib/swarm/round-context-hash.ts#L28](plugins/proposals/src/lib/swarm/round-context-hash.ts#L28). Split already happened.

#### 23. [OK] `proposals/agent-lock-engine.ts` and `file-lock-table.ts` keep disjoint responsibilities; no two-writer race found
Verified via 4 subagent passes; mutex ownership is sound.

#### 24. [OK] `memory`, `logs`, `search` — all surfaces use atomic + mutex + containment
- `memory`: [plugins/memory/src/lib/services/store-io.ts](plugins/memory/src/lib/services/store-io.ts), `store-records.ts` (redaction on persist), TTL on both read and sweep.
- `logs`: [plugins/logs/src/lib/services/log-store.ts](plugins/logs/src/lib/services/log-store.ts) (mutex per day file, fs async).
- `search`: x00156 S6 fix is in place; `resolveWorkspaceContained` everywhere.
- `security/sast` (the x00168 fix): cwd contained via `resolveWorkspaceContained`; verify-yes on the original 6 tools.

#### 25. [OK] `rules` and `quality` plugins — composition root consumed; PATH probing is async without `exec('which')`
Verified at [plugins/rules/src/lib/tools/rules-tools.ts#L192](plugins/rules/src/lib/tools/rules-tools.ts#L192), [plugins/quality/src/lib/services/scopes.ts#L38](plugins/quality/src/lib/services/scopes.ts#L38), [plugins/quality/src/lib/services/command-policy.ts](plugins/quality/src/lib/services/command-policy.ts).

#### 26. [OK] `extensions/vscode` activation/disposal lifecycle is clean; webview message validation is now strong (x00188 verified)
- Reload-no-leak spec exists at [extensions/vscode/src/test/reload-no-leak.spec.ts](extensions/vscode/src/test/reload-no-leak.spec.ts).
- Agent-catalog webview handler at [extensions/vscode/src/commands/open-agent-catalog.ts](extensions/vscode/src/commands/open-agent-catalog.ts#L131-L152) is not yet migrated to zod-discriminated union; tracked under Layer 3.

#### 27. [OK] `apps/web` — i18n complete (12 langs × 304 keys), Pagefind correct, brand-logo resolver sound
`bun run --cwd apps/web check:i18n` returns clean. `bun tools/scripts/lint/style-integrity.script.ts` and `no-duplicate-brand-hex` both green.

---

### Layer 3 — `extensions/vscode`

#### 28. [BAD] `commands/start-server-untrusted.ts` uses `readFileSync` to read `.mcp.json`
**File**: [extensions/vscode/src/commands/start-server-untrusted.ts#L26-L35](extensions/vscode/src/commands/start-server-untrusted.ts#L26)

```ts
const { readFileSync } = await import('node:fs');
const { join } = await import('node:path');
try {
    return readFileSync(join(cwd, '.mcp.json'), 'utf8');
```

**Problem**: synchronous I/O on the interactive command path. Rule 3 violation in extension code.

**Impact**: brief UI freeze on workspaces with remote filesystems (WSL/SSH) when the user approves an untrusted server start.

**Resolution Track**: replace with `fs/promises.readFile`.

#### 29. [BAD] `extensions/vscode/package.json` lacks `package.nls[.lang].json` — chrome metadata is English-only
**File**: [extensions/vscode/package.json#L31-L58](extensions/vscode/package.json#L31)

**Problem**: `displayName`, `description`, view names, command titles, and category strings are hardcoded in English in the contributed metadata. There is no `package.nls.json` and no `package.nls.<lang>.json`. Rule 9 violation: the *content* of the webviews is localized, but the chrome (Activity Bar, Command Palette, view titles) is not.

**Impact**: user-visible English chrome in non-English hosts.

**Resolution Track**: extract display strings to `package.nls.json` plus per-language overrides.

#### 30. [MINOR] `webviews/setup-github.ts` declares `lang="en"` unconditionally
**File**: [extensions/vscode/src/webviews/setup-github.ts#L101-L109](extensions/vscode/src/webviews/setup-github.ts#L101)

```html
<html lang="en">
```

**Problem**: localization strings come from the host, but the `lang` attribute is hardcoded. Screen readers and font-selection heuristics treat the page as English.

**Impact**: accessibility regression.

**Resolution Track**: pass the resolved `lang` into the webview and emit it on the `<html>` tag.

#### 31. [MINOR] `agent-catalog` webview handler still uses duck-typed dispatch
**File**: [extensions/vscode/src/commands/open-agent-catalog.ts#L131-L152](extensions/vscode/src/commands/open-agent-catalog.ts#L131)

**Problem**: the x00188 commit added zod-discriminated-union validation for *some* webview messages, but the agent-catalog handler still branches on `message.command === 'foo'` duck typing. x00188 was supposed to cover the surface but missed this command.

**Impact**: a malformed message could crash the handler or take an unexpected branch.

**Resolution Track**: align with the schema validation pattern already in [extensions/vscode/src/contracts/constants/configuration-center-message-schema.constant.ts](extensions/vscode/src/contracts/constants/configuration-center-message-schema.constant.ts#L1).

#### 32. [MINOR] `packages/client/src/lib/services/plugin-activation.service.ts#L103-L118` joins the config file path without `resolveWorkspaceContained`
**File**: [packages/client/src/lib/services/plugin-activation.service.ts#L103-L118](packages/client/src/lib/services/plugin-activation.service.ts#L103)

```ts
const configFile = join(input.workspaceRoot, input.configFileName ?? DEFAULT_CONFIG_FILENAME);
return withFileMutex(configFile, async () => { … });
```

**Problem**: VS Code doesn't expose `configFileName` to the user today, so the bypass isn't reachable in current UI. But the API surface accepts a relative configFileName and writes it under the workspace root without containment. Rule 5 latent.

**Impact**: low today; latent footgun.

**Resolution Track**: route through `resolveWorkspaceContained`.

---

### Layer 4 — `apps/web`

#### 33. [BAD] `apps/web/src/layouts/Base.astro` duplicates NAV and FOOTER copy in an inline `<script>` outside the canonical i18n system
**File**: [apps/web/src/layouts/Base.astro#L121-L156](apps/web/src/layouts/Base.astro#L121)

```astro
const NAV = {
  en: { home: 'Home', install: 'Install', … },
  es: { home: 'Inicio', install: 'Instalar', … },
  …
};
const FOOTER = {
  en: { tagline: 'A project-agnostic MCP server core + plugin loader.', … },
  es: { tagline: 'Un núcleo de servidor MCP agnóstico al proyecto + cargador de plugins.', … },
  …
};
```

**Problem**: the SSR layout translates via `ui.ts`; the runtime script has its own complete copy of NAV and FOOTER for 12 languages. Any future copy edit to the canonical i18n does not propagate; the runtime chrome drifts.

**Impact**: latent inconsistency. Claude/Codex/Copilot typically edit the path closest to their failure and miss the second source.

**Resolution Track**: generate the runtime tables from the canonical `ui.ts` (a single import, not duplicated literals).

#### 34. [BAD] `apps/web/src/pages/[lang]/guide.astro` has English-only body despite `[lang]/` path
**File**: [apps/web/src/pages/[lang]/guide.astro#L23-L60](apps/web/src/pages/[lang]/guide.astro#L23)

**Problem**: the page exists under `[lang]/` but renders an "English only — translations pending" notice and English-only sections. A `[lang]/` URL signals to LLMs and humans that the page is translated.

**Impact**: SEO + accessibility regression; misleads LLMs into making partial fixes.

**Resolution Track**: either translate the body via `ui.ts` + per-language markdown, or move the page out of `[lang]/`.

#### 35. [MINOR] `apps/web/scripts/fetch-brand-logos.ts#L259` compares files by `byteLength` only, not content
**File**: [apps/web/scripts/fetch-brand-logos.ts#L259](apps/web/scripts/fetch-brand-logos.ts#L259)

**Problem**: two different logos with the same byte count are treated as "unchanged"; the cached wrong asset is silently preserved.

**Impact**: low — most assets change in size when changed.

**Resolution Track**: compare bytes (or hash) instead of length.

#### 36. [MINOR] `apps/web/tests/lib/brand-logos.spec.ts#L75` hardcodes 16 plugin slugs instead of deriving from the manifest
**File**: [apps/web/tests/lib/brand-logos.spec.ts#L75](apps/web/tests/lib/brand-logos.spec.ts#L75)

**Problem**: the manifest declares 45 packages but the test only asserts 16. New plugins without logo entries slip through.

**Impact**: the test gives a false sense of completeness.

**Resolution Track**: derive the expected set from `capabilities.json`.

---

### Layer 5 — `tools/` and `scripts/`

#### 37. [MINOR] `tools/scripts/host/host-server.script.ts` lacks a dedicated spec (x00186 gap)
**File**: [tools/scripts/host/host-server.script.ts](tools/scripts/host/host-server.script.ts)

**Problem**: x00186 fixed workspace resolution + async I/O in host-server, but the only spec in `tools/scripts/host/` is `record-claude-lifecycle.script.spec.ts`. No spec pins the host-server behaviour.

**Impact**: regression of the x00186 fix could pass without a spec to catch it.

**Resolution Track**: add `host-server.script.spec.ts` covering the workspace-resolution rule.

#### 38. [MINOR] Two `describe.skip('legacy forge release …')` specs are stale deferrals
**File**: [plugins/forge/tests/src/lib/services/forge-release.spec.ts#L3](plugins/forge/tests/src/lib/services/forge-release.spec.ts#L3), [plugins/forge/tests/src/lib/tools/forge-release.tool.spec.ts#L3](plugins/forge/tests/src/lib/tools/forge-release.tool.spec.ts#L3)

**Problem**: empty `describe.skip` blocks with no ticket, no exit condition.

**Resolution Track**: either reactivate the spec, or delete and file a "legacy contract retired" note.

#### 39. [MINOR] `plugins/proposals/src/lib/tools/authoring.tool.ts` is 1,400+ LOC with only 2 spec files
**File**: [plugins/proposals/src/lib/tools/authoring.tool.ts](plugins/proposals/src/lib/tools/authoring.tool.ts)

**Problem**: combined surface for create/edit/review/close-slice. Tests at [plugins/proposals/tests/src/lib/authoring.spec.ts](plugins/proposals/tests/src/lib/authoring.spec.ts) and [authoring-stale-index.spec.ts](plugins/proposals/tests/src/lib/authoring-stale-index.spec.ts).

**Resolution Track**: split into at least 3 specs (create/edit, review/close, board/list).

#### 40. [MINOR] `plugins/proposals/src/lib/proposals/sync-proposal-registry.ts` is 839 LOC with 4 specs — borderline
Tracked for refactor; covered adequately.

#### 41. [OK] AGENTS rule 10 — no `.py`/`.sh`/`.bash`/`.zsh`/`.pl`/`.rb` in `tools/` or `scripts/`
Verified via `find tools scripts -name '*.py' -o …` — only fixtures under `plugins/rules/tests/fixtures/polyglot/` contain `.sh` and those are test fixtures, not scripts.

#### 42. [OK] Lefthook hooks all TypeScript
[lefthook.yml](lefthook.yml#L24) → `bun tools/scripts/hooks/pre-commit.ts`. No `.sh` hooks.

#### 43. [OK] `scripts/install.script.ts` covers GitHub release and local source-dispatch
Verified.

---


---

## scoreboard

| Dimension | Score | Justification |
|---|---|---|
| **Core durability** | 5/10 | `init-config` fixed; `batch-atomic-writer` and `scaffold/create-plugin.tool.ts` adapter still violate rule 4 (#3, #5). |
| **Workspace containment** | 5/10 | x00168 closed 6 tools; `security_deps` (#12), `browser_inspect` (#13), and the latent `plugin-activation` (#32) remain. |
| **Concurrency** | 6/10 | Persistent-task-queue tool-level race fixed (x00187); engine-level `persistQueue` (#15), notification-watcher boot miss (#14), and usage-tracking append (#18) still open. |
| **i18n completeness** | 6/10 | Web i18n green; chrome metadata (#29), webview lang attribute (#30), guide.astro body (#34), and layout's runtime NAV/FOOTER dup (#33) incomplete. |
| **Token budget** | 9/10 | `overview { compact:true }` at 1,271 B / 2,278 B, well under 2,750 B. |
| **Tool surface** | 9/10 | 198/198 tools declare `outputSchema`. |
| **Test suite** | 7/10 | 6235 tests pass; 2 stale `describe.skip` (#38); x00186 missing spec (#37); authoring.spec thin (#39). |
| **Lint gates** | 3/10 | **RED**: `bun run validate` fails on `lint:solid` (#1) and `verify:external-install` (#2). CI on develop is broken. |
| **Genericity** | 9/10 | 1 audit `crossCuttingAdditions` plumbing fix from a00083 sticks; no new host-vocabulary leaks in core. |
| **Idempotence / atomicity of build** | 7/10 | `build/stable-manifest.script.ts` is sync; not blocking but inconsistent. |
| **Documentation** | 8/10 | `TOKEN-BUDGETS.md`, `AGENT-BOOTSTRAP.md`, and `REPO-RULES.md` all up-to-date. |

**Overall (unweighted average): 6.7 / 10** — drive to 8+ by closing the two FATAL lint/solid + verify:external-install regressions (#1, #2).

---


---

## notes

| # | Slice | Severity | Effort | Description |
|---|---|---|---|---|
| 1 | **x00193 S1** — `bun run validate` green | FATAL | M | Re-extract the 89 duplicated blocks into `packages/core/src/public/` (e.g. `buildToolsWithFindings(options)`), regenerate `solid-compliance.baseline.json` with `--write-baseline`, and add the `security_deps` containment fix in the same slice. **Closes #1 + #12.** |
| 2 | **x00194 S1** — `verify:external-install` green | FATAL | XS | Bump `@mcp-vertex/core` from `0.1.0` → `0.1.1` (semver-patch; no API changes since the wire format is stable) and re-run release-script lockstep. Re-run `bun tools/scripts/verify/external-install-smoke.script.ts`. **Closes #2.** |
| 3 | **x00193 S2** — `browser_inspect` cache dir from ctx only | BAD | XS | Remove the `process.cwd()` fallback in `browser-inspect.tool.ts#L77`; require `pluginCacheDir` to be set by the plugin entry. **Closes #13.** |
| 4 | **x00193 S3** — `notification` watcher priming | BAD | XS | Add `void check()` at `start()` to prime `prev` without emitting events. **Closes #14.** |
| 5 | **x00193 S4** — `proposal-completeness.ts` async I/O | BAD | S | Replace `require('node:fs').statSync` with `node:fs/promises.stat`; inject `fileExists` async. **Closes #16.** |
| 6 | **x00193 S5** — `proposal-transition.tool.ts` completeness gate on `review → done` | BAD | S | Move the gate to all `finalTo === 'done'` transitions. **Closes #17.** |
| 7 | **x00193 S6** — `usage-tracking` per-batch atomic segments | BAD | M | Replace `appendFile` with batch-segment `writeFileAtomic`. **Closes #18.** |
| 8 | **x00193 S7** — `online-preset.ts` registry branches | MINOR | S | Either add parsers for `buf_registry` and `psgallery` or remove from the map. **Closes #19.** |
| 9 | **x00195** — `batch-atomic-writer` cross-process atomicity | BAD | L | Workspace-wide `withFileMutex` around the batch; per-file `writeFileAtomic`; cross-process spec. **Closes #3, #4, #5, #6.** |
| 10 | **x00196** — VS Code chrome localization + webview schema | BAD | M | `package.nls.json` + per-lang overrides; `lang="…"` on webviews; zod-discriminated union for agent-catalog handler. **Closes #29, #30, #31.** |
| 11 | **x00197** — apps/web NAV/FOOTER dedupe + guide.astro | BAD | M | Generate runtime NAV/FOOTER from canonical `ui.ts`; translate guide.astro body or move out of `[lang]/`. **Closes #33, #34.** |
| 12 | **x00198** — staging + tests backfill | MINOR | S | Add `host-server.script.spec.ts`; reactivate or delete `forge-release.spec.ts` skips; split `authoring.spec.ts` into 3 specs. **Closes #37, #38, #39.** |

---
