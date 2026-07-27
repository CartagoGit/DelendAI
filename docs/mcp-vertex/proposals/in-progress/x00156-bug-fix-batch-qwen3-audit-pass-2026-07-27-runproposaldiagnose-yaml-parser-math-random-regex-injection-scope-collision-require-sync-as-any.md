---
id: x00156
title: "Bug fix batch — qwen3 audit pass 2026-07-27 (runProposalDiagnose + YAML parser + Math.random + regex injection + scope collision + require sync + as any)"
kind: fix
status: in-progress
type: proposal
track: core+proposals+search+cli
date: 2026-07-27
---

# x00156 — Bug fix batch — qwen3 audit pass 2026-07-27 (runProposalDiagnose + YAML parser + Math.random + regex injection + scope collision + require sync + as any)

## Goal

Fix the seven highest-impact bugs surfaced by the 2026-07-27 three-pass audit on the qwen3-7-plus model: (1) `runProposalDiagnose` outputSchema validation error — every call fails because `toolJson` lacks `ok: true`, blocking `auto_work` and `proposal_transition`; (2) `Math.random()` used in `quarantine-corrupt-file.ts` and `atomic-write.ts` to generate tmp/corrupt filenames, with the same RNG seed producing collisions under contention; (3) the three idiosyncratic YAML mini-parsers in `sync-proposal-registry.ts`, `proposal-parallelism.ts` and `proposal-acceptance.ts` lose data when frontmatter uses block-style arrays (most `shipped-in:`, `parallelismLanes:` and `extras:` entries on real proposals); (4) regex injection in `proposal-document.ts:199`, `migrate-foreign.ts:89`, `adopt.tool.ts:40` that interpolate a user-supplied `heading`/`key` directly into `new RegExp(...)` even though `escapeRegExp` exists in `string-helpers.ts:24`; (5) the `slugify` in `init-migrate-offer.service.ts:39` collapses Unicode (`café → caf-`) producing scope collisions across distinct workspaces; (6) a synchronous `require('node:os').hostname()` inside `authoring.tool.ts:1119` review-identity construction, and (`as any` on Zod-validated args at `authoring.tool.ts:1159,1312`); (7) `process.cwd()` fallback in `search-semantic.tool.ts:93` and `index-store.ts:27,39,51` despite the `workspaceRootAbs` field being required upstream.

The proposal is a **vertically-shipping, single-status batch**: each slice is an independent fix with its own tests, gated by `lint + type + verify`. The goal is to ship these seven fixes in a single reviewable proposal rather than scatter them across one-proposal-per-bug slivers that bloat the docs directory (a00077 already noted that 41-plugins folder creep is real).

The user's words — "audita mas a fondo buscando bugs" — produced three audit reports identifying 21 distinct bugs across 23 source files; this proposal covers the seven with the highest severity-to-effort ratio.

## Why

**Bug 1 is the only one that is actively blocking other work.** `auto_work` has returned idle 6+ times today because `proposal_diagnose` is broken; `proposal_transition` (regular) requires `proposal_diagnose` to validate the evidence freshness. Without the fix, the only path is `proposal_force_transition`, which is meant for emergencies and skips peer-review. Three force transitions today (`f00076`, `x00153`, `f00153 / f00154`) were workarounds because of this bug. None of those workarounds was intentional; they were the result of running out of options when the diagnose tool fails upstream.

**Bug 2 is a durability hazard, not a chance one.** The doc-comment at `quarantine-corrupt-file.ts:34-35` explicitly recognises the collision risk and writes "two readers that detect corruption in the same millisecond still get distinct backups". That guarantee relies on `Math.random()` being collision-resistant across processes, which it is not (V8 initializes one PRNG per Node process with the same algorithm; if two processes start in close succession — common on CI runners — they share the same first bunch of `Math.random()` outputs, modulo time). When the collision happens, the second writer overwrites the first writer's `.corrupt-{ts}-{rand}` file. The reader (next agent) sees only one quarantine evidence, not two, and the actual mutation is invisible.

**Bug 3 is a registry correctness issue.** The 304 on-disk proposals use YAML arrays in frontmatter (`shipped-in: [commit, commit]`, `cascade_override: { foo: bar }`, `parallelismLanes: [meta, audit]`, `extras:`, `closed-evidence: [- item]`). The three mini-parsers discard almost all of those fields. The `proposals/index.json` cache shows `count: 303-304` but the per-proposal entries are missing structured data that `proposal_diagnose`, `proposal_force_transition`, `proposal_review`, `auto_work` and the swarm-coordination tools all consume. The `yaml` lib is already an indirect dependency (transitive via `yaml-language-server`); promoting it to a direct dep is a one-line `package.json` change.

**Bugs 4-7 are real but lower priority.** Each is fixed in <30 lines; all four would land in a single review wave.

## Why this design

Each slice is a **vertically-shipping unit**: tests in, fix in, lint+type+verify passes, slice marked done. Slices are independent (no file overlap, no shared state beyond the test fixtures).

- S1 fixes the most-likely-to-bleed bug with no dependency on other slices.
- S2 changes two files in `core/src/lib/shared/`, breaking the `Math.random` collar.
- S3 unifies YAML parsing into one shared helper.
- S4 deploys `escapeRegExp` to three sites that invented their own.
- S5 swaps the `slugify` for a SHA-1-prefixed path-derived scope.
- S6 refactors `authoring.tool.ts` review-identity to drop the sync `require` and the `as any`.
- S7 deletes the `process.cwd()` fallback and forces the upstream to provide `workspaceRootAbs`.

## Non-goals

- **Not** solving the drift in conventions profile (8.9% unmatched — a separate linter proposal).
- **Not** closing the `eslint-disable` budget (separate lint proposal).
- **Not** rewriting the registry to use `gray-matter` (overkill; lib is already present).
- **Not** modifying the agent_lock engine's broader semantics (bug #19 — duplicate ownership is a data-cleanup, not a fix).
- **Not** reverting the recent `setFrontmatterField` validation (already correct).

## Slices

- global_gate: validate

### S1 — `runProposalDiagnose` returns `ok: true`

- **Status**: pending
- **Files**: `plugins/proposals/src/lib/tools/recovery-tools.ts` (line 629, change `return toolJson({...})` → `return toolOk({...})`), `plugins/proposals/tests/src/lib/tools/proposal-diagnose.spec.ts` (new — assertion that the tool returns `ok: true` in `structuredContent`).
- **Gate**: type + verify
- **Acceptance**:
  - The handler at `recovery-tools.ts:629` returns `toolOk({...})` matching the other 4 runners in the same file.
  - `proposal_diagnose { id: "<existing>" }` returns a body whose `structuredContent.ok === true`.
  - No `outputSchema` validation error from the MCP SDK for any input.
  - The new spec covers: standard call, not-found (returns `toolError`), and the cross-proposal mode (`crossProposal: true`).

### S2 — Replace `Math.random()` in tmp/corrupt filename generators

- **Status**: pending
- **Files**: `packages/core/src/lib/shared/quarantine-corrupt-file.ts` (line 39), `packages/core/src/lib/shared/atomic-write.ts` (line 32), `packages/core/tests/src/lib/shared/quarantine-corrupt-file.spec.ts` (new — collision-resistance test), `packages/core/tests/src/lib/shared/atomic-write.spec.ts` (new — collision-resistance test).
- **Gate**: type + verify
- **Acceptance**:
  - Both files use `randomBytes(4).toString('hex')` (from `node:crypto`) instead of `Math.random().toString(36).slice(2)`.
  - Imports add `randomBytes` from `node:crypto` (already imported elsewhere; no new dependency).
  - Tests show: two parallel `quarantine...()` calls in the same ms produce distinct paths; same for `writeFileAtomic` tmpPathFor. The test imports an `IFileSystem`-backed harness and asserts `unique(tmpPaths).length === N`.

### S3 — Unify the three YAML frontmatter parsers

- **Status**: pending
- **Files**: `plugins/proposals/src/lib/proposals/sync-proposal-registry.ts` (replace `parseFrontmatter` body with `yaml.parse(...)`), `plugins/proposals/src/lib/proposals/proposal-parallelism.ts` (replace `parseInlineBracketList` calls with `yaml.parse(...)` and remove the helper), `plugins/proposals/src/lib/proposals/proposal-acceptance.ts` (same), `plugins/proposals/package.json` (add `yaml` to `dependencies`), `packages/core/package.json` (idempotent — `yaml` is already a transitive dep, promote to direct).
- **Gate**: type + verify + lint
- **Acceptance**:
  - `parseFrontmatter` is replaced by `yaml.parse(extractYamlBlock(raw))`. It returns the parsed object as-is.
  - `parseInlineBracketList` is removed from `proposal-parallelism.ts`. `asStringArray` parses with `yaml.parse` directly.
  - Tests in `proposal-document.spec.ts` and `proposal-parallelism.spec.ts` cover all frontmatter shapes used in `docs/mcp-vertex/proposals/done/**` — block arrays, inline arrays, nested objects, and quoted strings.
  - `bun run sync-proposal-registry` produces an `index.json` whose entries now have `cascade_override`, `cascade_boost`, `extras`, `shipped-in`, `closed-evidence`, `parallelism_lanes` and `main_write_lane` as **arrays / objects / null**, not strings.

### S4 — Apply `escapeRegExp` to the three sites that interpolate raw strings

- **Status**: pending
- **Files**: `plugins/proposals/src/lib/proposals/proposal-document.ts` (line 199), `plugins/proposals/src/lib/proposals/migrate-foreign.ts` (line 89), `plugins/proposals/src/lib/tools/adopt.tool.ts` (line 40). All three import `escapeRegExp` from `../shared/string-helpers` (or the canonical path).
- **Gate**: type + verify
- **Acceptance**:
  - Each call site uses `escapeRegExp(heading)` / `escapeRegExp(key)` before template-string interpolation into `new RegExp(...)`.
  - A new spec in `proposal-document.spec.ts` covers headings with `[`, `(`, `.`, `*`, `+`, `?`, `^`, `$`, `{`, `}`, `|`, `\\` characters and confirms the matched section is the literal heading rather than a regex interpretation.
  - A new spec in `migrate-foreign.spec.ts` covers the same character set for keys.

### S5 — Workspace-scope derivation uses the abs path, not just the basename

- **Status**: pending
- **Files**: `packages/cli/src/lib/init/init-migrate-offer.service.ts` (lines 39-50, both `slugify` and `deriveScope`), `packages/cli/tests/src/lib/init/init-migrate-offer.spec.ts` (new — Unicode collapse test, basename collision test).
- **Gate**: type + verify
- **Acceptance**:
  - `deriveScope` returns `${slugify(basename)}-${sha1(absPath).slice(0, 8)}`.
  - Two workspaces with basenames `café-prod` and `cafe-prod` in `/a/` and `/b/` produce different scopes (`caf-prod-1a2b3c4d` vs `caf-prod-5e6f7a8b`).
  - Same workspace opened twice produces the same scope (idempotency).
  - The adopt tool idempotency property (`findExistingAdoptionId`) holds across these cases.

### S6 — Drop the synchronous `require('node:os')` and the `as any`

- **Status**: pending
- **Files**: `plugins/proposals/src/lib/tools/authoring.tool.ts` (lines 1119, 1159, 1312), `plugins/proposals/tests/src/lib/tools/authoring.spec.ts` (new — review-identity helper exposes its deps, no internal `require` call).
- **Gate**: type + verify + lint
- **Acceptance**:
  - `os` is imported at the top of the file with `import { hostname } from 'node:os'`.
  - The fallback `reviewIdentityDeps` uses the static-imported `hostname`, not `require('node:os').hostname()`.
  - The two `as any` casts are replaced with the correct Zod-inferred types (`IProposalReviewAction` and `IRounds`).
  - Tests assert that running `authoring.tool.ts` in a hot loop emits no `require('node:os')` (the static analyzer confirms the require pattern is gone).

### S7 — Remove `process.cwd()` fallback in `search` cache layout

- **Status**: pending
- **Files**: `plugins/search/src/lib/embed/index-store.ts` (lines 27, 39, 51), `plugins/search/src/lib/tools/search-semantic.tool.ts` (line 93).
- **Gate**: type + verify
- **Acceptance**:
  - The fallback to `process.cwd()` is replaced with a `throw new Error('workspaceRootAbs required')` or similar — at the boundary, not the silent fallback.
  - `IEmbedIndexStoreOptions.workspaceRootAbs` becomes required (the schema that produced it already requires the field).
  - Tests: when `workspaceRootAbs` is missing, the function throws (rather than writes to `.cache/` in `cwd`).

## Acceptance

- `bun run validate` exits 0 with all 7 slices landed.
- `auto_work` is unblocked: `proposal_diagnose` returns `ok: true` again.
- `sync-proposal-registry` produces structured `shipped-in: string[]` (not strings).
- No regression in the 21 unaffected bugs (they remain documented for follow-up).

## Notes

### The git-blame dig for bug 1

`331ce520` (2026-07-25) "fix(a00072): S1 — purgeStaleLocks helper + state_health stale check + proposal_diagnose cross-proposal (F148/F151)" introduced the regression. Before the commit, the handler used `toolOk({...})`. The fix is a one-character token change (`toolJson` → `toolOk`).

### Why a batch instead of one-proposal-per-bug

a00077's audit notes that 41 plugins are already in the codebase and the proposal directory has 300+ entries. Each new proposal adds (a) a `## Slices` plan, (b) four `## Acceptance`/`## Notes` bodies, (c) a frontmatter entry, (d) a registry entry. Seven proposals for seven trivial fixes would balloon the docs cost without proportional review benefit. A single batch proposal with seven independent slices ships at the same effective cost as one fix per proposal and is easier to revert en bloc.

### What this proposal does NOT cover

- Bug #4 (require sync) and bug #5 (as any) are inside S6.
- Bug #19 (ownership duplicates in agent-lock-engine) is **not** in this batch — it requires a migration that snapshots existing lock files; separate proposal.
- Bug #17 (tests pass in isolation, fail in suite) is **not** in this batch — it requires reproducing the interference pattern, which is a tracing exercise, not a fix.

The user explicitly asked for the most actionable subset; the seven slices above are those.

## why

Bugs found in 3-pass audit on 2026-07-27. Bug #1 (proposal_diagnose) actively blocks auto_work today. Bug #2 (Math.random in tmp filenames) is a real durability hazard under contention. Bug #3 (YAML parser) loses structured frontmatter for the 304 on-disk proposals. Bugs #4-7 are small, surgical, and shippable.

## non-goals

- Do not solve conventions drift (223 unmatched files) - separate linter proposal
- Do not close the eslint-disable budget - separate lint proposal
- Do not rewrite the registry to use gray-matter - overkill, yaml is enough
- Do not modify agent_lock engine semantics (dupe ownership) - separate cleanup proposal
- Do not revert the setFrontmatterField validation - it's already correct

## Slices

- global_gate: lint

### S1 — runProposalDiagnose returns ok: true
- **Status**: pending
- **Files**: `plugins/proposals/src/lib/tools/recovery-tools.ts`, `plugins/proposals/tests/src/lib/tools/proposal-diagnose.spec.ts`
- **Gate**: type
- acceptance:
  - "The handler at recovery-tools.ts:629 returns toolOk({...}) matching the other 4 runners in the same file"
  - "proposal_diagnose { id: '<existing>' } returns a body whose structuredContent.ok === true"
  - "No outputSchema validation error from the MCP SDK for any input"
  - "New spec covers: standard call, not-found (returns toolError), and the cross-proposal mode (crossProposal: true)"

### S2 — Replace Math.random in tmp/corrupt filename generators
- **Status**: pending
- **Files**: `packages/core/src/lib/shared/quarantine-corrupt-file.ts`, `packages/core/src/lib/shared/atomic-write.ts`, `packages/core/tests/src/lib/shared/quarantine-corrupt-file.spec.ts`, `packages/core/tests/src/lib/shared/atomic-write.spec.ts`
- **Gate**: type
- acceptance:
  - "Both files use randomBytes(4).toString('hex') (from node:crypto) instead of Math.random().toString(36).slice(2)"
  - "Imports add randomBytes from node:crypto (already imported elsewhere; no new dependency)"
  - "Tests show: two parallel calls in the same ms produce distinct paths. The test imports an IFileSystem-backed harness and asserts unique(tmpPaths).length === N"

### S3 — Unify the three YAML frontmatter parsers
- **Status**: pending
- **Files**: `plugins/proposals/src/lib/proposals/sync-proposal-registry.ts`, `plugins/proposals/src/lib/proposals/proposal-parallelism.ts`, `plugins/proposals/src/lib/proposals/proposal-acceptance.ts`, `plugins/proposals/package.json`, `packages/core/package.json`
- **Gate**: lint
- acceptance:
  - "parseFrontmatter is replaced by yaml.parse(extractYamlBlock(raw)). It returns the parsed object as-is"
  - "parseInlineBracketList is removed from proposal-parallelism.ts. asStringArray parses with yaml.parse directly"
  - "Tests in proposal-document.spec.ts and proposal-parallelism.spec.ts cover all frontmatter shapes used in docs/mcp-vertex/proposals/done/** - block arrays, inline arrays, nested objects, and quoted strings"
  - "bun run sync-proposal-registry produces an index.json whose entries now have cascade_override, cascade_boost, extras, shipped-in, closed-evidence, parallelism_lanes and main_write_lane as arrays / objects / null, not strings"

### S4 — Apply escapeRegExp to the three sites that interpolate raw strings
- **Status**: pending
- **Files**: `plugins/proposals/src/lib/proposals/proposal-document.ts`, `plugins/proposals/src/lib/proposals/migrate-foreign.ts`, `plugins/proposals/src/lib/tools/adopt.tool.ts`
- **Gate**: type
- acceptance:
  - "Each call site uses escapeRegExp(heading) / escapeRegExp(key) before template-string interpolation into new RegExp(...)"
  - "New spec in proposal-document.spec.ts covers headings with [, (, ., *, +, ?, ^, $, {, }, |, \\ characters and confirms the matched section is the literal heading rather than a regex interpretation"
  - "New spec in migrate-foreign.spec.ts covers the same character set for keys"

### S5 — Workspace-scope derivation uses the abs path, not just the basename
- **Status**: pending
- **Files**: `packages/cli/src/lib/init/init-migrate-offer.service.ts`, `packages/cli/tests/src/lib/init/init-migrate-offer.spec.ts`
- **Gate**: type
- acceptance:
  - "deriveScope returns ${slugify(basename)}-${sha1(absPath).slice(0, 8)}"
  - "Two workspaces with basenames café-prod and cafe-prod in /a/ and /b/ produce different scopes (caf-prod-1a2b3c4d vs caf-prod-5e6f7a8b)"
  - "Same workspace opened twice produces the same scope (idempotency)"
  - "The adopt tool idempotency property (findExistingAdoptionId) holds across these cases"

### S6 — Drop the synchronous require('node:os') and the as any in authoring.tool.ts
- **Status**: pending
- **Files**: `plugins/proposals/src/lib/tools/authoring.tool.ts`, `plugins/proposals/tests/src/lib/tools/authoring.spec.ts`
- **Gate**: lint
- acceptance:
  - "os is imported at the top of the file with import { hostname } from 'node:os'"
  - "The fallback reviewIdentityDeps uses the static-imported hostname, not require('node:os').hostname()"
  - "The two as any casts are replaced with the correct Zod-inferred types (IProposalReviewAction and IRounds)"
  - "Tests assert that running authoring.tool.ts in a hot loop emits no require('node:os') (the static analyzer confirms the require pattern is gone)"

### S7 — Remove process.cwd() fallback in search cache layout
- **Status**: pending
- **Files**: `plugins/search/src/lib/embed/index-store.ts`, `plugins/search/src/lib/tools/search-semantic.tool.ts`
- **Gate**: type
- acceptance:
  - "The fallback to process.cwd() is replaced with a throw new Error('workspaceRootAbs required') or similar - at the boundary, not the silent fallback"
  - "IEmbedIndexStoreOptions.workspaceRootAbs becomes required (the schema that produced it already requires the field)"
  - "Tests: when workspaceRootAbs is missing, the function throws (rather than writes to .cache/ in cwd)"

## acceptance

- The handler at recovery-tools.ts:629 returns toolOk({...}) matching the other 4 runners in the same file
- proposal_diagnose { id: '<existing>' } returns a body whose structuredContent.ok === true
- No outputSchema validation error from the MCP SDK for any input
- New spec covers: standard call, not-found (returns toolError), and the cross-proposal mode (crossProposal: true)
- Both files use randomBytes(4).toString('hex') (from node:crypto) instead of Math.random().toString(36).slice(2)
- Imports add randomBytes from node:crypto (already imported elsewhere; no new dependency)
- Tests show: two parallel calls in the same ms produce distinct paths. The test imports an IFileSystem-backed harness and asserts unique(tmpPaths).length === N
- parseFrontmatter is replaced by yaml.parse(extractYamlBlock(raw)). It returns the parsed object as-is
- parseInlineBracketList is removed from proposal-parallelism.ts. asStringArray parses with yaml.parse directly
- Tests in proposal-document.spec.ts and proposal-parallelism.spec.ts cover all frontmatter shapes used in docs/mcp-vertex/proposals/done/** - block arrays, inline arrays, nested objects, and quoted strings
- bun run sync-proposal-registry produces an index.json whose entries now have cascade_override, cascade_boost, extras, shipped-in, closed-evidence, parallelism_lanes and main_write_lane as arrays / objects / null, not strings
- Each call site uses escapeRegExp(heading) / escapeRegExp(key) before template-string interpolation into new RegExp(...)
- New spec in proposal-document.spec.ts covers headings with [, (, ., *, +, ?, ^, $, {, }, |, \\ characters and confirms the matched section is the literal heading rather than a regex interpretation
- New spec in migrate-foreign.spec.ts covers the same character set for keys
- deriveScope returns ${slugify(basename)}-${sha1(absPath).slice(0, 8)}
- Two workspaces with basenames café-prod and cafe-prod in /a/ and /b/ produce different scopes (caf-prod-1a2b3c4d vs caf-prod-5e6f7a8b)
- Same workspace opened twice produces the same scope (idempotency)
- The adopt tool idempotency property (findExistingAdoptionId) holds across these cases
- os is imported at the top of the file with import { hostname } from 'node:os'
- The fallback reviewIdentityDeps uses the static-imported hostname, not require('node:os').hostname()
- The two as any casts are replaced with the correct Zod-inferred types (IProposalReviewAction and IRounds)
- Tests assert that running authoring.tool.ts in a hot loop emits no require('node:os') (the static analyzer confirms the require pattern is gone)
- The fallback to process.cwd() is replaced with a throw new Error('workspaceRootAbs required') or similar - at the boundary, not the silent fallback
- IEmbedIndexStoreOptions.workspaceRootAbs becomes required (the schema that produced it already requires the field)
- Tests: when workspaceRootAbs is missing, the function throws (rather than writes to .cache/ in cwd)
