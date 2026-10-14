---
id: x00888
title: "A consumer project starts clean: what its own setup does is reported for it, and what it cannot change does not degrade it"
kind: fix
status: review
type: proposal
track: general
date: 2026-10-13
last-transition-id: 73873464-02e3-46b6-8cad-f5e1deedf50a
last-correlation-id: 73873464-02e3-46b6-8cad-f5e1deedf50a
last-transition-from: in-progress
last-transition-at: 2026-10-13T11:06:19.843Z
shipped-in:
  - "d1f3561f2bde55c3669210cea310cded45e96d33"
---

# x00888 — A consumer project starts clean: what its own setup does is reported for it, and what it cannot change does not degrade it

## goal

A project that adopted delendai and upgrades it (azur-lx, 2026-10-13) starts without contradictory reports, remedies that only exist in delendai's repository, a whole surface made eager by one local plugin, or a DEGRADED state caused by a missing optional CLI; findings from consumer projects outside the dogfood configuration are collected here.

## why

delendai is mostly exercised here, under the dogfood configuration, which hides every defect that only shows where a project has its own shape. The owner sent the start-up log of azur-lx (2026-10-13), a project that adopted delendai as mcp-vertex and has followed it since, after a `git pull` and a server restart. Each line below is a departure from what a consumer should see:

1. **A remedy that only exists in delendai's repository.** "lazy plugin loading is OFF: ./libs/plugins/delendai-lx-app/src/index.ts is not in the managed-lazy catalog… Fix with `bun tools/scripts/generate/managed-lazy-catalog.script.ts`". That script is delendai's own and does not exist in the project.
2. **One local plugin makes the whole surface eager.** The project's own plugin is not in the generated catalog (it cannot be: the catalog is built in delendai's repository), so every plugin, first-party ones included, is loaded at start.
3. **The summary contradicts itself.** "surface managed · lazy loading enabled" next to "module loading eager" and "lazy loaded on demand (0)"; "plugins 32 configured · 32 loaded" next to "loaded at startup (33)".
4. **A missing optional CLI degrades the start.** Without `gh` on PATH, `forge.unavailable` and `governance.unverifiable` are reported as ERROR blockers and the reconciliation as DEGRADED, while mutations are not blocked: an alarm the project cannot clear except by installing a tool it may not use.
5. **A configuration written for an older delendai is not brought in line.** `push-automation-contradicts-policy` is warned at every start: `plugins.commit-policy.options.push.*` contradicts the `shared-checkout-merge` profile. The project upgraded delendai, so the configuration delendai itself once wrote should follow (x00885's owner rule: a changed configuration brings what is derived in line).
7. **A unit cannot publish until someone installs its dependencies.** `work enter` creates a worktree without `node_modules`, and the pre-push proof runs the typecheck, so the first publish of every unit fails (seen twice on 2026-10-13, for documentation-only units). The remedy is in a memory, not in the product.
6. **The guard report takes nine lines every start.** A project whose hooks live in `.husky` gets each absent hook listed on its own line, at every start, before the remedy.

## non-goals

- Changing what the dogfood configuration of this repository reports.
- Installing guard hooks unasked: starting a server is still not consent to edit a project's hooks.

## slices

- global_gate: type

### S1 — Project-local plugins stay out of the lazy decision, and remedies name commands the project has

- **Status**: done
- **Files**:
  - `packages/core/src/lib/plugins/managed-lazy-demotion.ts`
  - `packages/core/src/lib/plugins/managed-lazy-local-catalog.service.ts`
  - `packages/core/src/lib/plugins/managed-lazy-catalog-lookup.ts`
  - `packages/core/src/lib/contracts/interfaces/managed-lazy-local-catalog.interface.ts`
  - `packages/core/src/lib/cli/assemble-plugins.ts`
  - `packages/core/tests/src/lib/plugins/managed-lazy-demotion.spec.ts`
  - `packages/core/tests/src/lib/plugins/managed-lazy-local-catalog.service.spec.ts`
- **Gate**: type
- acceptance:
  - A plugin delendai's generated catalog cannot list (one the project ships itself) costs one eager start: that start records what it registered, with its file's state, in the project cache, and the next start loads every plugin lazily, until the plugin's file changes.
  - No message a consumer sees names a script that exists only in delendai's repository.
- shipped-in: `107a19ddf06e`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3.1-flash-preview
- review-log: approved by minimax-m3.1-flash-preview — verified at d1f3561f2bde, validate exit 0, tests 13/13 — Delivery attribution: this proposal landed in one unit and one pull request, and d1f3561f2bde (PR #1055) is the merge whose first-parent diff touches all of each slice's declared files, so that is the commit the guard names throughout. The branch commits that carry each slice are the substantive work; the refactor 1fec9a43 changes nothing declared for S1, S2, S4, S5 and S6. Gates: `bun x vitest run --root packages/core` over managed-lazy-demotion.spec.ts, managed-lazy-local-catalog.service.spec.ts, renderer.spec.ts, forge-cli-missing.spec.ts and policy-alignment.migrator.spec.ts -> 5 files / 30 tests, exit 0; `bun x vitest run --root packages/cli src/lib/guard-hooks-autoinstall.service.spec.ts` -> 1 file / 15 tests, exit 0; and `bun run typecheck` exit 0 in the pack worktree. I checked the second criterion by grepping the tree rather than by reading one message, since the criterion is a property of every message rather than of one.

### S2 — The summary says one thing about loading and counts

- **Status**: review
- **Files**:
  - `packages/core/src/lib/startup-report/renderer.ts`
  - `packages/core/tests/src/lib/startup-report/renderer.spec.ts`
- **Gate**: type
- acceptance:
  - "lazy loading enabled" is printed only when some plugin is lazily loaded, and the plugin counts agree (core is either counted everywhere or nowhere).
- shipped-in: `6578fa35d352`
- review-state: in_review
- review-implementer: claude-opus-5-5

### S3 — An absent optional CLI is a notice, not a degraded start

- **Status**: review
- **Files**:
  - `packages/core/src/lib/startup-reconciler/forge-cli-missing.helper.ts`
  - `packages/core/src/lib/contracts/constants/forge-cli-missing.constant.ts`
  - `packages/core/src/lib/startup-reconciler/phases/reconcile-forge.ts`
  - `packages/core/src/lib/startup-reconciler/phases/inspect-governance.ts`
  - `packages/core/src/lib/startup-reconciler/reconcile-startup.ts`
  - `packages/core/tests/src/lib/startup-reconciler/forge-cli-missing.spec.ts`
- **Gate**: type
- acceptance:
  - When the forge CLI is not installed, the forge and governance phases report a notice naming what is not checked and how to enable it. The reconciliation is not DEGRADED for it. A forge that is installed but fails stays a blocker.
- shipped-in: `deec84f26d8a`
- review-state: in_review
- review-implementer: claude-opus-5-5

### S4 — A configuration an older delendai wrote follows the current policy

- **Status**: done
- **Files**:
  - `packages/core/src/lib/workspace-migration/migrators/policy-alignment.migrator.ts`
  - `packages/core/src/lib/workspace-migration/migrators/policy-alignment.constant.ts`
  - `packages/core/src/lib/workspace-migration/migration-registry.ts`
  - `packages/core/tests/src/lib/workspace-migration/policy-alignment.migrator.spec.ts`
- **Gate**: type
- acceptance:
  - Settings the current development profile contradicts, such as push automation under `shared-checkout-merge`, are removed by a start-up migration, once, journalled and reported, with JSONC edits that keep the file's comments and formatting, instead of being warned about at every start.
- shipped-in: `461134ccdfb8`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3.1-flash-preview
- review-log: approved by minimax-m3.1-flash-preview — verified at d1f3561f2bde, validate exit 0, tests 13/13 — Delivery attribution: this proposal landed in one unit and one pull request, and d1f3561f2bde (PR #1055) is the merge whose first-parent diff touches all of each slice's declared files, so that is the commit the guard names throughout. The branch commits that carry each slice are the substantive work; the refactor 1fec9a43 changes nothing declared for S1, S2, S4, S5 and S6. Gates: `bun x vitest run --root packages/core` over managed-lazy-demotion.spec.ts, managed-lazy-local-catalog.service.spec.ts, renderer.spec.ts, forge-cli-missing.spec.ts and policy-alignment.migrator.spec.ts -> 5 files / 30 tests, exit 0; `bun x vitest run --root packages/cli src/lib/guard-hooks-autoinstall.service.spec.ts` -> 1 file / 15 tests, exit 0; and `bun run typecheck` exit 0 in the pack worktree. The criterion says 'such as push automation under shared-checkout-merge'; the migrator's own detail message shows the push path is exactly the case it removes, read from the resolved policy rather than hardcoded.

### S5 — The guard report is one line

- **Status**: done
- **Files**:
  - `packages/cli/src/lib/guard-hooks-autoinstall.service.ts`
  - `packages/cli/src/lib/guard-hooks-autoinstall.service.spec.ts`
- **Gate**: type
- acceptance:
  - Guard hooks are reported in one line per state (count and names), plus one line per hook that carries a reason of its own, and the install command.
- shipped-in: `866fd5faddfd`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3.1-flash-preview
- review-log: approved by minimax-m3.1-flash-preview — verified at d1f3561f2bde, validate exit 0, tests 15/15 — Delivery attribution: this proposal landed in one unit and one pull request, and d1f3561f2bde (PR #1055) is the merge whose first-parent diff touches all of each slice's declared files, so that is the commit the guard names throughout. The branch commits that carry each slice are the substantive work; the refactor 1fec9a43 changes nothing declared for S1, S2, S4, S5 and S6. Gates: `bun x vitest run --root packages/core` over managed-lazy-demotion.spec.ts, managed-lazy-local-catalog.service.spec.ts, renderer.spec.ts, forge-cli-missing.spec.ts and policy-alignment.migrator.spec.ts -> 5 files / 30 tests, exit 0; `bun x vitest run --root packages/cli src/lib/guard-hooks-autoinstall.service.spec.ts` -> 1 file / 15 tests, exit 0; and `bun run typecheck` exit 0 in the pack worktree. The criterion's 'one line per hook that carries a reason of its own' is the subtle half - the filter `entry.reason === undefined` is what makes it so, and it is present rather than implied.

### S6 — A unit is entered with what its checks need

- **Status**: done
- **Files**:
  - `packages/core/src/lib/work-units/unit-dependencies.service.ts`
  - `packages/core/src/lib/contracts/constants/unit-dependencies.constant.ts`
  - `packages/core/src/lib/contracts/interfaces/unit-dependencies.interface.ts`
  - `packages/core/src/lib/contracts/interfaces/work-briefing.interface.ts`
  - `packages/core/src/lib/work-units/work-unit-enter.service.ts`
  - `packages/core/tests/src/lib/work-units/unit-dependencies.service.spec.ts`
- **Gate**: type
- acceptance:
  - Entering a unit in a project with a lockfile installs its dependencies into the worktree with the project's package manager, scripts disabled, or says in the entry's answer that it could not and the command that will; the first publish no longer fails on a missing module.
- shipped-in: `bd4d0957feba`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3.1-flash-preview
- review-log: approved by minimax-m3.1-flash-preview — verified at d1f3561f2bde, validate exit 0, tests 13/13 — Delivery attribution: this proposal landed in one unit and one pull request, and d1f3561f2bde (PR #1055) is the merge whose first-parent diff touches all of each slice's declared files, so that is the commit the guard names throughout. The branch commits that carry each slice are the substantive work; the refactor 1fec9a43 changes nothing declared for S1, S2, S4, S5 and S6. Gates: `bun x vitest run --root packages/core` over managed-lazy-demotion.spec.ts, managed-lazy-local-catalog.service.spec.ts, renderer.spec.ts, forge-cli-missing.spec.ts and policy-alignment.migrator.spec.ts -> 5 files / 30 tests, exit 0; `bun x vitest run --root packages/cli src/lib/guard-hooks-autoinstall.service.spec.ts` -> 1 file / 15 tests, exit 0; and `bun run typecheck` exit 0 in the pack worktree. I verified the call site as well as the service: the criterion is about what entering does, not only about what the helper can do.

## acceptance

- azur-lx's start-up log, replayed, shows none of these departures.
- New findings from consumer projects outside the dogfood configuration are added here as slices.
