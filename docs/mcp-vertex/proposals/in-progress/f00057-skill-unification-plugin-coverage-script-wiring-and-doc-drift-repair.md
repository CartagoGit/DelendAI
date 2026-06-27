---
id: f00057
status: in-progress
type: proposal
track: skills+plugins+tools+scripts+docs+workflow
date: 2026-06-25
kind: feat
title: Skill unification + plugin coverage + script wiring + doc-drift repair
shipped-in:
  - 451abe38 # fix(f00057 S5): sync skill manifest bodyPath to the renamed mcp-vertex-* dirs
  - 85f2d56a # feat(f00057 S10): wire 4 orphan scripts into the dev toolchain
  - 94536da3 # refactor(f00057 S8): extract the TypeScript file-convention profile to packages/core/
  - 09f39a5e # feat(f00057 S7): add conventions to the swarm preset
recan: []
slices-done:
  - S5  # appliesTo consistently declared on all 17 skills + check-skills lint enforces it
  - S7  # conventions added to swarm preset (resolvePresetMembers('swarm') -> 13 plugins)
  - S8  # TypeScript file-convention profile extracted to packages/core/src/lib/contracts/file-conventions.contract.ts
  - S10 # lint:skills + verify:tools wired into validate; site:codegen + metrics:gate as opt-in; fix-fb88376-imports archived
  - S11 # docs_search deprecated with replacement: search_search; setup_github clarified in plugins/docs/README.md
slices-pending:
  - S1  # proposals-canonical-workflow skill fusion
  - S2  # token-budget-discipline skill fusion
  - S3  # multi-agent-coordination skill fusion
  - S4  # audit-end-to-end skill fusion
  - S6  # 6 new P1 plugin playbook skills (git, deps, issues, test-convention, conventions, notification)
  - S9  # synchronise 5 plugin READMEs
  - S12 # unify knowledge-entry naming to <plugin>-<topic>
  - S13 # fix core compilation/validation issues (H1/H3/H4)

related:
  - f00049 # conventions unification — f00057 owns S8's playbook merge + extends S4's per-plugin layout migration to the remaining plugins
  - f00051 # multi-language rules presets — f00057 must coordinate S8 docs that cross with skill merging
  - f00056 # agent-discovery catalog — f00057 feeds it via `appliesTo:` enrichment on every skill; does NOT create a parallel catalog
  - f00054 # repo root declutter — f00057 S8 docs end up under docs/skills/ but the root stays clean
  - f00052 # agent_worktree host-flag — f00057 S1 (proposals-canonical-workflow) must reference the flag awareness, not duplicate it
  - a00036 # a00036 findings — R-09 (manifest drift) is resolved by f00057 S3
  - a00042 # audit that surfaced compilation and SDK drift findings
ownership:
  - { agent: proposal_guardian,    task: 'S1: merge `proposal-swarm-runner` + `proposals-workflow-playbook` + plans-q into one canonical `proposals-canonical-workflow` skill (and remove `mcp-vertex-legacy-proposal-migration` from the agent-facing catalogue once superseded)' }
  - { agent: implementation_runner, task: 'S2: merge `token-budget-playbook` + `mcp-vertex-token-budget-discipline` into one canonical `token-budget-discipline` skill (keep measured-budgets table + compact-first rule)' }
  - { agent: implementation_runner, task: 'S3: merge `mcp-vertex-multi-agent-coordination` + `concurrency-patterns` into one canonical `multi-agent-coordination` skill (preserve 3-patterns examples + `withFileMutex` + agent_lock/agent_worktree + no-poll + lock-conflict)' }
  - { agent: implementation_runner, task: 'S4: merge `audit-playbook` + `mcp-vertex-audit-runner` into one canonical `audit-end-to-end` skill (10 phases + consolidation + rubric in one body)' }
  - { agent: implementation_runner, task: 'S5: add `appliesTo:` frontmatter consistently to every remaining skill (transversal ones use `@mcp-vertex/*`); bumps the skill manifest contract without touching f00056' }
  - { agent: implementation_runner, task: 'S6: ship six new P1 plugin playbook skills — `plugins-git`, `plugins-deps`, `plugins-issues`, `plugins-test-convention`, `plugins-conventions`, `plugins-notification` (covers the 6 plugins that currently lack a skill and have real operational complexity)' }
  - { agent: implementation_runner, task: 'S7: add `conventions` to the `swarm` preset in `preset-catalog.ts` (it is implemented but invisible to every default preset; `no-preset-drift` lint verifies the move)' }
  - { agent: implementation_runner, task: 'S8: extract the TypeScript file-convention profile to `packages/core/src/lib/contracts/file-conventions.contract.ts` and rewrite both `plugins/conventions/src/lib/services/typescript-profile.service.ts` AND `tools/scripts/lint/file-conventions.ts` to import from there (parity spec proves no drift)' }
  - { agent: implementation_runner, task: 'S9: synchronise the five stale plugin READMEs against the live registerTool surface — `git`, `deps`, `memory`, `quality`, `logs` — using a single template (header → Enable → Tools table → Configuration → Options → Hard deps)' }
  - { agent: implementation_runner, task: 'S10: wire the four orphan scripts into `validate` — `tools/scripts/lint/check-skills.script.ts` (`lint:skills`), `tools/scripts/verify/plugin-tool-verify.script.ts` (`verify:tools`), `tools/scripts/metrics/collect-candidate.script.ts` + `diff-snapshots` + `get-baseline` (`metrics:gate`), `tools/scripts/astro/gen-section-pages.script.ts` + `i18n/translate-tutorials.script.ts` (`site:codegen`)' }
  - { agent: implementation_runner, task: 'S11: deprecate `docs_search` (semantically subsumed by `search_search` with `roots:["docs"]`; mark the tool deprecated in its registration, point callers at the wrapper, remove in a follow-up) and clarify `setup_github` (kept — it is a CLI-style helper distinct from `issues_*`, document its scope in the new `plugins-issues` skill)' }
  - { agent: implementation_runner, task: 'S12: unify knowledge-entry naming to `<plugin>-<topic>`, force ≥1 per plugin, and backfill `conventions` + `proposals` (the two plugins that currently expose zero knowledge entries)' }
  - { agent: implementation_runner, task: 'S13: fix core compilation/validation issues by updating catalog/assemble (H1), regenerating tool outputs SDK (H3), and fixing proposal linter warnings (H4)' }
globalGate: validate
acceptance:
  - { command: bun run typecheck,         expect: exit0 }
  - { command: bun run test,              expect: exit0 }
  - { command: bun run lint:tools,        expect: exit0 }
  - { command: bun run lint:proposals,    expect: exit0 }
  - { command: bun run lint:skills,       expect: exit0 }   # newly wired by S10
  - { command: bun run verify:tools,      expect: exit0 }   # newly wired by S10
  - { command: bun run site:codegen,      expect: exit0 }   # newly wired by S10
  - { command: bun run validate,          expect: exit0 }
  - { command: 'skill manifest parity',   expect: '21 → 17 skills (4 fusions) + 6 new P1 = 21 entries; every entry has `appliesTo` or the explicit `@mcp-vertex/*` wildcard' }
---

# f00057 — Skill unification + plugin coverage + script wiring + doc-drift repair

## Goal

Bring the catalogue of skills, plugins, scripts, and READMEs into the same
discipline AGENTS.md already enforces on the rest of the repo. The audit
triggered this proposal surfaced four classes of drift:

1. **Skill duplication.** Four pairs of skills cover the same ground with
   different framings — agents pick one and miss the other half.
2. **Plugins without playbooks.** Six plugins (out of 16) have real
   operational complexity but zero skill coverage, so an agent landing cold
   has to read the README, the `index.ts`, and the `*.tool.ts` files just
   to learn the workflow.
3. **Scripts that exist but never run.** Eight `*.script.ts` files are not
   wired into any `bun run` command — including the one that gates the
   skill manifest itself.
4. **Drift between docs and code.** Five plugin READMEs document fewer
   tools than their `registerTool` surface registers, the file-convention
   profile is duplicated between a plugin and a lint, and one plugin is
   entirely absent from every preset.

This proposal closes all four classes in 12 slices without duplicating
[f00049](../ready/f00049-conventions-unification-r10-slices.md) (which
already touched i18n and partial layout migration), [f00051](../ready/f00051-multilanguage-rules-presets.md) (language presets), or
[f00056](../ready/f00056-agent-discovery-tool-skill-catalog-and-extension-hints.md) (unified agent-discovery catalog).

### What is in scope

- **4 skill fusions** that reduce 17 entries to 13 while gaining content.
- **1 compilation & SDK fix slice (S13)** that resolves H1 (TS/Zod schema error on `appliesTo`), H3 (stale tool outputs), and H4 (proposal frontmatter kind warning).
- **6 new plugin playbook skills** that bring the catalogue from 13 to 21
  entries with first-class coverage of `git`, `deps`, `issues`,
  `test-convention`, `conventions`, and `notification`.
- **1 preset wiring** (`conventions` → `swarm`).
- **1 contract extraction** (file-convention profile into `packages/core`).
- **5 README synchronisations** (the five stale plugins).
- **4 script wirings** (the orphan lint, verify, metrics, codegen scripts).
- **1 deprecation** (`docs_search`).
- **1 knowledge-entry unification** (`<plugin>-<topic>` convention, ≥1 per plugin).

### What is out of scope

- **No new agent-discovery catalog.** [f00056 S1+S2](../ready/f00056-agent-discovery-tool-skill-catalog-and-extension-hints.md)
  owns that surface; f00057 only enriches it by adding `appliesTo:` to
  every skill so the catalog can filter correctly.
- **No multi-language presets.** [f00051](../ready/f00051-multilanguage-rules-presets.md) S3 owns those; f00057 S6 keeps the new `plugins-rules` skill harmonised but does not add new languages.
- **No i18n de-hosting.** [f00049 S7](../ready/f00049-conventions-unification-r10-slices.md) owns that; the cosmetic double-prefix (`quality_quality_cancel`) is documented as known but not refactored here.
- **No new top-level root file.** Skill directory stays under `skills/`; the README template S9 produces lives under each `plugins/<name>/README.md`.

---

## why

The maintainer's request: *"revisa el proyecto y los plugins con exhaustividad,
por si hiciera falta alguna skill mas en alguno de ellos"*. What the audit
found is that the gap is not just "missing skills" — it is a **systematic
imbalance** between how thoroughly AGENTS.md enforces code invariants
(hard rules 1–10) and how thinly the catalogue of skills, scripts, and
READMEs is curated. AGENTS.md codifies "the core stays agnostic", "no
`process.cwd()` in engines", "every tool declares `outputSchema`", and
those rules are enforced by gates (`lint:tools`, `verify:tools`,
`validate`). No equivalent discipline exists for skills or scripts. The
table below is the delta between the two surfaces:

| Dimension | Code (tools, plugins, core) | Catalogue (skills, scripts, READMEs) |
|---|---|---|
| Coverage | 100% (`outputSchema` on every tool, every plugin has spec companions) | 11 of 17 skills lack `appliesTo:`; 5 of 16 plugin READMEs drift from code; 8 of 53 scripts are not wired into `validate` |
| Duplication | 0 (`no-preset-drift`, `cli-shape`, `no-duplicate-brand-hex`) | 4 skill pairs cover ≥70% the same ground |
| Discoverability | High (`mcp-vertex_overview` lists every loaded tool) | Low (`conventions` plugin is invisible in every preset; `setup_github` is referenced in 0 proposals) |
| Drift detection | `biome ci`, `tsc --noEmit`, `vitest run` | None — `check-skills.script.ts` exists but is not wired |
| Token economy | `token-budget.e2e.spec.ts` measures overview/auto_work | Token budgets for skills are not measured; `token-budget-playbook` and `mcp-vertex-token-budget-discipline` duplicate the same advice |

The result is that **a contributor who respects the code invariants can
still produce a contribution that breaks the catalogue**: a plugin author
who updates `registerTool` does not have to update the README; a skill
author who adds a new entry does not have to declare which plugin it
applies to; a script author who writes a `*.script.ts` does not have to
wire it into a gate. f00057 closes those gaps by giving the catalogue
the same gate + test discipline the code already has.

### Quantitative baseline (from the audit)

- **17 skills, 4 pairs duplicate ≥70%**: `token-budget-playbook` ↔ `mcp-vertex-token-budget-discipline`; `proposal-swarm-runner` ↔ `proposals-workflow-playbook`; `mcp-vertex-multi-agent-coordination` ↔ `concurrency-patterns`; `audit-playbook` ↔ `mcp-vertex-audit-runner`.
- **16 plugins, 6 lack any playbook**: `git`, `deps`, `issues`, `test-convention`, `conventions`, `notification`. Of these, the first 5 have P1 complexity (write-tools security, offline-by-default, hard-dep on proposals, drift-rule table, invisibility); `notification` is P2 but pairs with `mcp-vertex-multi-agent-coordination` enough that a focused playbook is cheap insurance.
- **53 scripts, 8 are unwired**: `tools/scripts/lint/check-skills.script.ts`, `tools/scripts/verify/plugin-tool-verify.script.ts`, `tools/scripts/metrics/collect-candidate.script.ts` (+ pipeline), `tools/scripts/astro/gen-section-pages.script.ts`, `tools/scripts/i18n/translate-tutorials.script.ts`, `tools/scripts/migrate/fix-fb88376-imports.script.ts` (one-shot, archive), `tools/scripts/host/rename-audit-engine.ts` + `rename-audit-tool.ts` (unverified usage).
- **5 plugin READMEs stale**: `git` documents 4 of 9 tools, `deps` 2 of 5, `memory` 4 of 6, `quality` 1 of 4, `logs` 0 of 5.
- **1 cross-package drift**: `plugins/conventions/src/lib/services/typescript-profile.service.ts` and `tools/scripts/lint/file-conventions.ts` define the same TypeScript profile independently. No parity spec.

---

## non-goals

- **Do not create a parallel agent-discovery catalog.** [f00056](../ready/f00056-agent-discovery-tool-skill-catalog-and-extension-hints.md) S1+S2 owns that; f00057 only feeds it by adding `appliesTo:` to every skill so the catalog can resolve "skills for plugin X" without parsing bodies.
- **Do not touch the audit methodology.** The 10-phase rubric in `audit-playbook` stays valid; f00057 S4 only *moves* it into a single merged skill (`audit-end-to-end`) so the rubric and the consolidation tool flow live in one place.
- **Do not rename plugin or package directories.** `plugins/conventions` keeps its id even though it now lives in `swarm`; only the preset catalog gains the membership entry.
- **Do not delete the legacy `migrate-*.script.ts` trio.** They stay available for one-shot use; f00049's `S2` already re-shelved `done/` into kind buckets, the lint treats `l`-prefixed files as a permanent warning (not an error), and `mcp-vertex-legacy-proposal-migration` skill stays reachable from `appliesTo: ['@mcp-vertex/proposals']` for the rare historical migration.
- **Do not refactor plugin layout to `lib/{services,tools,contracts}/` for every plugin.** [f00049 S4](../ready/f00049-conventions-unification-r10-slices.md) migrated 8 plugins; the remaining 6+ plugins stay as they are unless a slice explicitly moves them. Layout migration is a low-value cosmetic change once the function is in the right file.
- **Do not introduce a new top-level directory.** Skills stay under `skills/`; only the merged SKILL bodies move into the surviving directory name.

---

## Slices

### S1 — Merge proposals workflow skills into `proposals-canonical-workflow`

- **Files**: `skills/proposals-canonical-workflow/SKILL.md`, `skills/proposal-swarm-runner/SKILL.md` (delete), `skills/proposals-workflow-playbook/SKILL.md` (delete), `skills/manifest.json`, `skills/manifest.spec.ts` (if it exists)
- **Status**: ready
- **Gate**: bun run lint:skills
- **Acceptance**:
  - "One new SKILL.md at `skills/proposals-canonical-workflow/SKILL.md` carries every section from both merged skills: overview→auto_work→continue→lock→edit→validate→close→sync decision tree, 3 persist modes (`none`/`commit`/`commit-and-push`), 4 'never do's (no-poll, no push without agent_worktree flag, no hand-edit `index.json`, no sync mid-flight), `q00001` plans and the `proposals_close_plan` workflow, memory hygiene at slice-close, `await_lock` + `lock-released` notification contract, and the `withFileMutex` cross-process primitive."
  - "`appliesTo: ['@mcp-vertex/proposals']` is declared; the body uses `@mcp-vertex/proposals` references consistently."
  - "`skills/manifest.json` removes the 2 old entries and adds the new one; `lint:skills` parity check passes."
  - "`mcp-vertex-legacy-proposal-migration` is **kept** (still useful for one-shot `pNNN` migrations) but renamed in the catalog so a contributor can tell the difference between 'day-to-day workflow' and 'one-time migration'."

### S2 — Merge token-budget skills into `token-budget-discipline`

- **Files**: `skills/token-budget-discipline/SKILL.md` (rewrite — already exists for core), `skills/token-budget-playbook/SKILL.md` (delete), `skills/mcp-vertex-token-budget-discipline/SKILL.md` (delete or rename to `token-budget-discipline`), `skills/manifest.json`
- **Status**: ready
- **Gate**: bun run lint:skills
- **Acceptance**:
  - "One SKILL.md (the existing `mcp-vertex-token-budget-discipline/SKILL.md`) is rewritten as the canonical token-budget discipline; it absorbs the 4-row compact↔verbose table from `token-budget-playbook` (overview / auto_work / search ≤ 50 results / agent-catalog) and adds the 5th row (`audit_audit_consolidate`)."
  - "The merged skill keeps the existing `appliesTo: ['@mcp-vertex/core']` and explicitly cross-references the 5 tools that must NEVER be called from the main thread (`proposal_board`, `state_health`, `audit_audit_consolidate`, `search` with `maxResults > 50`, full `agent-catalog`)."
  - "`skills/manifest.json` removes the duplicate entry; `lint:skills` passes."

### S3 — Merge multi-agent-coordination + concurrency-patterns into `multi-agent-coordination`

- **Files**: `skills/multi-agent-coordination/SKILL.md` (rename from `concurrency-patterns` or `mcp-vertex-multi-agent-coordination`), `skills/mcp-vertex-multi-agent-coordination/SKILL.md` (delete), `skills/concurrency-patterns/SKILL.md` (delete), `skills/manifest.json`
- **Status**: ready
- **Gate**: bun run lint:skills
- **Acceptance**:
  - "The merged skill covers the 2 primitives (`withFileMutex` cross-process, `agent_lock`/`agent_worktree` multi-agent), the 3 condensed session examples A/B/C from the original `multi-agent-coordination`, the host-flag awareness from f00052, the no-poll contract, and the `lock-conflict` recovery pattern from `failure-modes` (cross-link without duplicating)."
  - "`appliesTo: ['@mcp-vertex/proposals', '@mcp-vertex/notification']` is declared."
  - "`skills/manifest.json` removes the 2 old entries and adds the new one."

### S4 — Merge audit-playbook + audit-runner into `audit-end-to-end`

- **Files**: `skills/audit-end-to-end/SKILL.md`, `skills/audit-playbook/SKILL.md` (delete), `skills/mcp-vertex-audit-runner/SKILL.md` (delete), `skills/manifest.json`
- **Status**: ready
- **Gate**: bun run lint:skills
- **Acceptance**:
  - "One SKILL.md carries the 10-phase methodology (Phase 0 quantitative baseline → Phase 8 final report) from `audit-playbook` AND the tool-level workflow (`audit_plan` → fresh session → save `.md` → `audit_consolidate`) from `mcp-vertex-audit-runner` AND the 5-band × 9-dim rubric AND the filename convention (`aNNNNN-DD-MM-YYYY-controlador-modelo-queSeHaAuditado.md`)."
  - "`appliesTo: ['@mcp-vertex/audit']` is declared."
  - "A 'before you start' section reminds the contributor that `audit` is opt-in and is NOT in any preset by default."

### S5 — Add `appliesTo:` consistently to every remaining skill

- **Files**: `skills/*/SKILL.md` (11 files: `mcp-vertex-plugin-authoring`, `mcp-vertex-failure-modes`, `mcp-vertex-operator`, `state-repair-playbook`, `audit-end-to-end` (S4), `mcp-vertex-status-marker-and-closure`, `mcp-vertex-quality-and-rules-gates`, `mcp-vertex-rules-solid-architecture`, `mcp-vertex-conventional-commits-and-release`, `proposals-canonical-workflow` (S1), `token-budget-discipline` (S2), `multi-agent-coordination` (S3)), `skills/manifest.json`, `tools/scripts/lint/check-skills.script.ts`
- **Status**: ready
- **Gate**: bun run lint:skills (now wired in S10)
- **Acceptance**:
  - "Every skill in `skills/manifest.json` declares an `appliesTo:` array. Transversal skills use the explicit wildcard `['@mcp-vertex/*']`; plugin-specific skills use the concrete plugin id (e.g. `['@mcp-vertex/git']`, `['@mcp-vertex/audit']`)."
  - "`check-skills.script.ts` gains a `lint:skills` mode that fails the build if any skill in `manifest.json` lacks `appliesTo`, if any `bodyPath` does not resolve on disk, or if any `appliesTo` references a plugin that does not exist in `packages/` or `plugins/`."

### S6 — Ship six new P1 plugin playbook skills

- **Files**: `skills/plugins-git/SKILL.md`, `skills/plugins-deps/SKILL.md`, `skills/plugins-issues/SKILL.md`, `skills/plugins-test-convention/SKILL.md`, `skills/plugins-conventions/SKILL.md`, `skills/plugins-notification/SKILL.md`, `skills/manifest.json`
- **Status**: ready
- **Gate**: bun run lint:skills
- **Acceptance**:
  - "`plugins-git`: documents the 7 read-only tools in recommended order (`git_changed` → `git_diff --stat` → `git_log` → `git_blame` → `git_show`), the 2 opt-in write tools with their security invariants (Conventional Commits mandatory, `--amend` rejected unless same author, `git_push` rejects `main`/`master`, only `force: 'with-lease'`), the asymmetry with `proposals_auto_work` persist modes, and a 'never do' list (no `git add .` from here, always be explicit in `files`). `appliesTo: ['@mcp-vertex/git']`."
  - "`plugins-deps`: documents the 3 base tools + 2 opt-in (`deps_outdated` requires `allowNetwork`, `package_install`/`package_run_script` require `allowWrite`), the 3 `kind` of findings from `deps_check` (`missing-lockfile`, `unpinned-range`, `duplicate-section`) and how to remediate each, the offline-by-default philosophy, the polyglot coverage, and the gate (`deps_check {ok:true, healthy:true}` before closing a slice that touches `package.json`). `appliesTo: ['@mcp-vertex/deps']`."
  - "`plugins-issues`: documents the hard dependency on `proposals` (loader refuses boot without it), the degraded 'no `repo` configured' mode (0 tools + 1 knowledge entry `issues-needs-repo-config`), the 3-tier auth model (`gh` / `rest-authed` / `rest-anon`) and what changes in each, the 5-tool pipeline (`list` → `fetch` → `ingest` → `analyze` → `resolve`), the boundary between `issues_*` MCP tools and the `setup-github` CLI helper, and the smoke (`issues_needs_repo_config` appears in `mcp-vertex_overview` when `repo` is missing). `appliesTo: ['@mcp-vertex/issues']`."
  - "`plugins-test-convention`: documents the 8 default fields and which are overridable per field, the 3 `specLayout` options (`colocate` / `tests-mirror` / `tests-flat`) with a worked example of `suggest_spec_path` output for each, the `forbiddenPatterns` REPLACES (not merges) rule, the 10 violation ids from `scan_drift` with their severity and which are blocking for `ok === true`, and the 'first file in a new area → call `suggest_spec_path` before writing the spec by hand' pattern. `appliesTo: ['@mcp-vertex/test-convention']`."
  - "`plugins-conventions`: documents why the plugin is opt-in (lives behind `--plugins=conventions` outside presets until S7 lands) and why it duplicates `tools/scripts/lint/file-conventions.ts` (AGENTS.md hard rule #1 forbids plugin → `tools/` import), the 2 tools (`conventions_classify` pure, `conventions_check` scan), the `roots` override option, the 3 invocation modes (per-file, per-area, full workspace), and the post-S8 contract that both consumers import from `packages/core/src/lib/contracts/file-conventions.contract.ts`. `appliesTo: ['@mcp-vertex/conventions']`."
  - "`plugins-notification`: documents the watcher model (`fs.watch` + polling fallback), the 3 lifecycle events (`agent-alive` / `agent-idle` / `agent-dead`), the `notify_status` and `await_lock` tools, the `lock-released` notification flow (paired with `multi-agent-coordination` skill without duplicating), and the boundary between MCP notifications and the host UI. `appliesTo: ['@mcp-vertex/notification']`."

### S7 — Add `conventions` to the `swarm` preset

- **Files**: `packages/core/src/lib/plugins/preset-catalog.ts`, `packages/core/tests/src/lib/plugins/preset-catalog.spec.ts`, `tools/scripts/lint/no-preset-drift.script.ts` (lint already exists; verify chain still holds)
- **Status**: ready
- **Gate**: bun run lint:setup (no-preset-drift)
- **Acceptance**:
  - "`PRESET_CATALOG` adds `{ plugin: 'conventions' }` to the `swarm` preset's `members` delta; the `no-preset-drift` lint verifies the new member exists in `plugins/conventions/package.json` and that the `full ⊇ swarm ⊇ standard ⊇ minimal` chain still holds."
  - "`resolvePresetMembers('swarm')` returns `conventions` alongside the existing 5 swarm members."
  - "`apps/web/src/i18n/presets/*.ts` (12 languages) gain a 1-line `summary` addition for the new member in the swarm preset view (if the page renders a per-plugin list); if it renders only the preset title, no i18n change is needed."
  - "The preset's `summary` string is updated to reflect the new member: e.g. 'Multi-agent coordination: standard + proposals, notification, logs, status-marker, test-convention, conventions.'"

### S8 — Extract the TypeScript file-convention profile to `packages/core/src/lib/contracts/`

- **Files**: `packages/core/src/lib/contracts/file-conventions.contract.ts` (new), `packages/core/src/lib/contracts/index.ts` (register the export), `packages/core/tests/src/lib/contracts/file-conventions.contract.spec.ts` (parity test), `plugins/conventions/src/lib/services/typescript-profile.service.ts` (rewrite to import the contract), `tools/scripts/lint/file-conventions.ts` (rewrite to import the contract), `tools/scripts/lint/file-conventions.script.ts` (no change if it delegates to the engine)
- **Status**: ready
- **Gate**: bun run lint:file-conventions (existing) + bun run test (parity spec)
- **Acceptance**:
  - "One TypeScript module in `packages/core/src/lib/contracts/file-conventions.contract.ts` exports `FILE_CONVENTIONS_PROFILE: readonly FileConventionRule[]` plus the rule shape, encoding every rule currently inlined in both `plugins/conventions/src/lib/services/typescript-profile.service.ts` and `tools/scripts/lint/file-conventions.ts`."
  - "Both consumers import `FILE_CONVENTIONS_PROFILE` from `@mcp-vertex/core` and the inlined copies are deleted."
  - "A parity spec (`file-conventions.contract.spec.ts`) enumerates every rule id and asserts both consumers apply the **same** rule for the same input path (no drift)."
  - "`bun run lint:file-conventions` and `bun run lint:conventions` (plugin-side parity check) both stay green; the test suite confirms byte-for-byte parity on a fixture workspace with one file per rule."

### S9 — Synchronise the five stale plugin READMEs

- **Files**: `plugins/git/README.md`, `plugins/deps/README.md`, `plugins/memory/README.md`, `plugins/quality/README.md`, `plugins/logs/README.md`, `docs/scaffolds/plugin-readme-template.md` (new — the template lives here so a contributor can copy it)
- **Status**: ready
- **Gate**: bun run validate (the drift is detected manually until S10's verify:tools gains a doc-vs-code check; for S9, a manual review + the new template are the gate)
- **Acceptance**:
  - "Every plugin README follows the same 6-section template: header (purpose in 1 sentence) → Enable (host snippet) → Tools (markdown table of every `registerTool` + 1-line description) → Configuration (jsonc example) → Options / Schema (table) → Hard deps (links to `appliesTo` dependencies)."
  - "Each of the 5 stale READMEs is rewritten so its Tools table lists **every** registered tool, including opt-ins (`git_commit`, `git_push`, `deps_outdated`, `package_install`, `memory_export`, `memory_import`, `quality_run_all`, `quality_cancel`, `logs_query`, `logs_correlate`, etc.)."
  - "`docs/scaffolds/plugin-readme-template.md` is the canonical template; `skills/mcp-vertex-plugin-authoring/SKILL.md` (S5 update) gains a paragraph that says 'after adding a tool, update the README — the new template lives at `docs/scaffolds/plugin-readme-template.md`'."

### S10 — Wire the four orphan scripts into `validate`

- **Files**: `package.json`, `lefthook.yml` (if hooks reference scripts), `tools/scripts/lint/check-skills.script.ts` (gain a `lint:skills` mode), `tools/scripts/verify/plugin-tool-verify.script.ts` (gain a `verify:tools` mode), `tools/scripts/metrics/collect-candidate.script.ts` + `diff-snapshots.script.ts` + `get-baseline.script.ts` (gain a `metrics:gate` aggregate), `tools/scripts/astro/gen-section-pages.script.ts` + `tools/scripts/i18n/translate-tutorials.script.ts` (gain a `site:codegen` aggregate)
- **Status**: ready
- **Gate**: bun run validate (the new scripts are inside it)
- **Acceptance**:
  - "`package.json` adds `lint:skills` → `check-skills.script.ts`, `verify:tools` → `plugin-tool-verify.script.ts`, `metrics:gate` → `collect-candidate` + `diff-snapshots` (against `get-baseline`), `site:codegen` → `gen-section-pages` + `translate-tutorials`."
  - "`bun run validate` includes the four new gates in its chain (after `lint:tools`, before `vitest run` for the cheap ones; after `vitest run` for the heavier ones)."
  - "Each new gate has a focused spec (`*.script.spec.ts` companion if missing) that runs in <2 s on the fixture workspace."
  - "`tools/scripts/migrate/fix-fb88376-imports.script.ts` and `tools/scripts/host/rename-audit-engine.ts` + `rename-audit-tool.ts` are moved into `docs/proposals/done/chores/` (as one-shot artefacts, not live scripts) or kept under `tools/scripts/` with an explicit `DO NOT RUN — historical` header; whichever is chosen, the decision is documented in `AGENTS.md`."

### S11 — Deprecate `docs_search` and clarify `setup_github`

- **Files**: `plugins/docs/src/lib/tools/tools.ts`, `plugins/docs/src/index.ts`, `plugins/docs/README.md`, `plugins/docs/tests/src/lib/tools/docs-pagination.spec.ts` (or whichever tests cover the tool), `apps/web/src/i18n/tools/docs_docs_search.ts` (delete or mark deprecated in 12 languages)
- **Status**: done
- **Gate**: bun run validate + bun run site:strict
- **Acceptance**:
  - "`docs_docs_search` is registered with `{ deprecated: true, since: '<version>', replacement: 'search_search', replacementArgs: { roots: ['docs'] } }` in its metadata; calling it returns `{ ok: false, error: { reason: 'deprecated', replacement: '...', since: '...' } }`. A migration comment in the registration points at the wrapper recipe."
  - "`plugins/docs/README.md` notes the deprecation in its Tools table (greyed out + replacement line)."
  - "`setup_github` is documented as a CLI-style helper distinct from the `issues_*` MCP tools (the 6 MCP tools operate on an already-configured repo; `setup_github` runs once at install time); the new `plugins-issues` skill (S6) carries this distinction."
  - "i18n: `apps/web/src/i18n/tools/docs_docs_search.ts` is marked deprecated in all 12 languages with a `deprecated.replacement` key; `site:strict` stays green (undocumented tools fail the gate; deprecated tools with a documented replacement do not)."

### S12 — Unify knowledge-entry naming and force ≥1 per plugin

- **Files**: `plugins/*/src/index.ts` (every plugin that builds `knowledge:`), `plugins/conventions/src/index.ts` (add 1), `plugins/proposals/src/index.ts` (add 1), `skills/mcp-vertex-plugin-authoring/SKILL.md` (S5 update — add the naming rule), `plugins/conventions/src/lib/knowledge/conventions-usage.ts` (new), `plugins/proposals/src/lib/knowledge/proposals-overview.ts` (new)
- **Status**: ready
- **Gate**: bun run lint:tools + bun run verify:tools (the new S10 gate fails if a plugin registers zero knowledge)
- **Acceptance**:
  - "Every knowledge entry's `id` follows the pattern `<plugin>-<topic>` where `<topic>` is a kebab-case noun (e.g. `audit-brief`, `deps-usage`, `git-orientation`, `quality-gates`, `rules-applying`, `status-marker-table`). The 5 current exceptions (`deps-usage`, `docs-usage`, `memory-usage`, `search-usage`, `web-usage` → OK; `quality-gates`, `git-orientation`, `status-marker-table`, `status-marker-states` → OK) are inventoried and any deviation is renamed."
  - "Plugins `conventions` and `proposals` (currently 0 knowledge entries each) gain at least 1: `conventions-usage` and `proposals-overview` respectively."
  - "A new gate inside `tools/scripts/verify/plugin-tool-verify.script.ts` (or a sibling script) fails the build if a plugin registered in `mcp-vertex_overview` has zero `IKnowledgeEntry` in its `register()` result."
  - "`mcp-vertex-plugin-authoring` (S5 update) gains a paragraph: 'every plugin registers ≥1 knowledge entry whose id matches `<plugin>-<topic>`; the catalog uses this to filter'."

---

## acceptance

- **17 skills → 13 (S1+S2+S3+S4) + 6 new P1 (S6) = 21** entries, every one with `appliesTo:` declared (S5).
- **No skill duplicated** (verified by `lint:skills` after S10 wiring).
- **`conventions` is loaded in `swarm` preset** by default (S7).
- **No drift** between `plugins/conventions` and `tools/scripts/lint/file-conventions.ts` (parity spec, S8).
- **5 plugin READMEs** match the live `registerTool` surface byte-for-byte (S9).
- **4 new gates** (`lint:skills`, `verify:tools`, `metrics:gate`, `site:codegen`) wire into `bun run validate` (S10).
- **`docs_search` is deprecated** with a documented replacement; `setup_github` is documented (S11).
- **Every plugin exposes ≥1 knowledge entry** with a `<plugin>-<topic>` id (S12).
- **`bun run validate` is green** at the end of every slice.

---

## notes

### Closure plan per slice

- **S1 (skill fusion — proposals)**: one new SKILL.md absorbs `proposal-swarm-runner` + `proposals-workflow-playbook` + plans-q; manifest drops 2 entries, gains 1; `mcp-vertex-legacy-proposal-migration` is kept (still useful) but renamed for clarity.
- **S2 (skill fusion — token budget)**: rewrite `mcp-vertex-token-budget-discipline/SKILL.md` as the canonical discipline; absorb the 4-row table from `token-budget-playbook` and add the 5th row.
- **S3 (skill fusion — multi-agent + concurrency)**: rename `concurrency-patterns` to `multi-agent-coordination` (or merge into a new directory); absorb the 3 examples A/B/C from the old `multi-agent-coordination`; keep `withFileMutex` + agent_lock/agent_worktree + no-poll + lock-conflict.
- **S4 (skill fusion — audit)**: new `skills/audit-end-to-end/SKILL.md` carries the 10-phase methodology + the tool-level workflow + the rubric.
- **S5 (appliesTo everywhere)**: bulk edit on 12 SKILL.md files; manifest contract gains a strict `appliesTo` requirement.
- **S6 (6 new P1 skills)**: 6 new directories under `skills/`, each with a ≤80-line SKILL.md following a single template (header → when to use → decision tree → gotchas → smoke → never-do).
- **S7 (conventions in swarm)**: one-line edit on `preset-catalog.ts` + a test asserting `resolvePresetMembers('swarm')` returns `conventions`.
- **S8 (extract file-conventions profile)**: one new contract module; two consumers rewrite to import it; one parity spec.
- **S9 (sync 5 READMEs)**: 5 rewrites + 1 template file under `docs/scaffolds/`.
- **S10 (wire 4 orphan scripts)**: 4 new entries in `package.json` + 4 spec companions where missing.
- **S11 (deprecate docs_search)**: edit 3 files + 1 i18n mark + 1 site:strict gate.
- **S12 (knowledge entries)**: 2 new knowledge modules + 1 entry in the verify gate.
- **S13 (appliesTo fixes & SDK sync)**: update `agent-discovery-catalog.ts`, `assemble.ts`, and catalog tests in `packages/core` to include and support `appliesTo` (H1); regenerate stale tool outputs SDK using `bun run types:generate` (H3); align proposal kind to fix frontmatter validation warnings (H4).

### Cross-slice ordering

Recommended execution order to keep `bun run validate` green at every step:

1. **S5** (appliesTo everywhere) — pure frontmatter edits, no behaviour change; makes every later skill-related lint pass.
2. **S13** (appliesTo fixes & SDK sync) — fixes compilation and validation issues immediately so that validation is green before proceeding with later steps.
3. **S10** (wire orphan scripts) — runs `check-skills` (now wired) + `plugin-tool-verify` on the existing manifest.
3. **S8** (extract file-conventions contract) — touches one plugin + one lint + adds a spec; no behaviour change.
4. **S7** (conventions in swarm) — one-line edit; lint verifies.
5. **S1 → S2 → S3 → S4** (skill fusions, in any order) — each removes manifest entries; verify:tools confirms no tool name disappears from `mcp-vertex_overview`.
6. **S6** (6 new P1 skills) — additive; can be split across multiple slices if needed (one skill per mini-slice).
7. **S9** (5 README rewrites) — independent of skill/preset changes.
8. **S12** (knowledge entries) — requires `verify:tools` to gain the zero-knowledge gate, so it lands after S10.
9. **S11** (deprecate docs_search) — last, so the deprecation notice lands in a release with a clear changelog entry.

### Token budget impact

- After S1+S2+S3+S4: the merged skills are **shorter** than the sum of their predecessors (~10–20% reduction; the bodies had overlap that the merge deletes).
- After S6: 6 new skills add ~480 lines of new content (≤80 lines each).
- After S5: 11 SKILL.md gain a 1-line `appliesTo:` block; net +11 lines.
- After S9: 5 README rewrites add ≤40 lines each.
- After S12: 2 new knowledge modules add ≤30 lines each.
- **Net: ~+550 lines across skills + READMEs + knowledge.** This is content the catalogue was missing; the token cost is paid by the agent who needs it (not by the cold-start `mcp-vertex_overview`).

### Conflicts and coordination

- **f00049 S8 (skill prefix unification + merge 3 overlapping playbooks)** — f00057 S1+S2+S3 absorb the "merge 3 overlapping playbooks" half; the "skill prefix unification" half stays with f00049 (it is about how skill ids are formatted, which is a separate concern from merging bodies). **Coordination:** f00057 lists f00049 in its `related:` and adds a note to f00049 S8 saying 'merges moved to f00057 S1/S2/S3'.
- **f00049 S4 (migrate 8 plugins to `lib/{services,tools,contracts}/`)** — f00057 does NOT migrate the remaining 6+ plugins; the only file moves in f00057 are within `plugins/conventions/src/lib/services/` (rewrite, not move) and within `tools/scripts/lint/` (rewrite, not move).
- **f00051 S8 (docs + skills for rules multi-language)** — f00057 S5 adds `appliesTo` to `mcp-vertex-rules-solid-architecture` and `mcp-vertex-quality-and-rules-gates`; f00051 S8 then updates those bodies for multi-language. **Order:** S5 first, then f00051 S8.
- **f00056 S2 (skill manifest contract + compact summaries)** — f00057 S5 adds `appliesTo` to the manifest; f00056 S2 then parses `appliesTo` to enrich the catalog. **Order:** S5 first, then f00056 S2.
- **f00052 (agent_worktree host flag)** — f00057 S1 references the flag in `proposals-canonical-workflow` (do not duplicate the decision tree; cross-link to the flag's own section).

### Risk and rollback

- **S1, S2, S3, S4** are content fusions; rollback is "restore the deleted SKILL.md + revert the manifest" (a single git revert per slice).
- **S5** is additive frontmatter; rollback is a git revert.
- **S6** is additive; rollback is "delete the new SKILL.md + manifest entry".
- **S7** is a one-line catalog edit; rollback is `git revert`.
- **S8** is a contract extraction; rollback requires restoring the inlined profiles in both consumers + deleting the contract.
- **S9** is doc-only; rollback is `git revert`.
- **S10** adds gates; rollback removes the `package.json` entries (a small risk if the wired scripts have a bug — the spec companions added in S10 mitigate this).
- **S11** is a soft deprecation; rollback is "remove the `deprecated: true` flag".
- **S12** is additive; rollback deletes the 2 new knowledge modules and the new verify-gate rule.

### What this proposal explicitly does NOT do

- It does **not** delete the legacy `mcp-vertex-legacy-proposal-migration` skill (still useful for one-shot `pNNN` migrations; kept reachable from `appliesTo: ['@mcp-vertex/proposals']`).
- It does **not** rewrite `audit-plan` (a00032 S4 already compacted `mcp-vertex_overview`; this proposal only merges the *skills*, not the tools).
- It does **not** introduce a new top-level directory or host-specific catalog file (f00056 owns that surface).
- It does **not** add multi-language presets to `rules` (f00051 owns that).
- It does **not** de-host i18n (f00049 S7 owns that).
- It does **not** touch `mcp-vertex_overview` token budget (already measured by `token-budget.e2e.spec.ts`).
