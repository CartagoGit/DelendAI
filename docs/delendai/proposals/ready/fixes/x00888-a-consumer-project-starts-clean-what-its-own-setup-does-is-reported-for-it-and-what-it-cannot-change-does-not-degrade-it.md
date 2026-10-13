---
id: x00888
title: "A consumer project starts clean: what its own setup does is reported for it, and what it cannot change does not degrade it"
kind: fix
status: ready
type: proposal
track: general
date: 2026-10-13
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

- **Status**: pending
- **Files**:
  - `packages/core/src/lib/plugins/managed-lazy-demotion.ts`
- **Gate**: type
- acceptance:
  - A plugin loaded from a path inside the project is loaded at start on its own; the first-party plugins stay lazy.
  - No message a consumer sees names a script that exists only in delendai's repository.

### S2 — The summary says one thing about loading and counts

- **Status**: pending
- **Files**:
  - `packages/core/src/lib/cli/startup-report.ts`
- **Gate**: type
- acceptance:
  - "lazy loading enabled" is printed only when some plugin is lazily loaded, and the plugin counts agree (core is either counted everywhere or nowhere).

### S3 — An absent optional CLI is a notice, not a degraded start

- **Status**: pending
- **Files**:
  - `packages/core/src/lib/startup-reconciler/phases/reconcile-forge.ts`
- **Gate**: type
- acceptance:
  - When the forge CLI is not installed, the forge and governance phases report a notice naming what is not checked and how to enable it. The reconciliation is not DEGRADED for it. A forge that is installed but fails stays a blocker.

### S4 — A configuration an older delendai wrote follows the current policy

- **Status**: pending
- **Files**:
  - `packages/core/src/lib/workspace-migration/config-transitions.service.ts`
- **Gate**: type
- acceptance:
  - Settings the current development profile contradicts, such as push automation under `shared-checkout-merge`, are removed by a configuration transition at start, recorded and reported once, instead of being warned about at every start.

### S5 — The guard report is one line

- **Status**: pending
- **Files**:
  - `packages/cli/src/lib/guard-hooks-autoinstall.service.ts`
- **Gate**: type
- acceptance:
  - Absent guard hooks are reported in one line naming their count, where they would go and the command that installs them.

### S6 — A unit is entered with what its checks need

- **Status**: pending
- **Files**:
  - `packages/core/src/lib/work-units/work-unit-enter.service.ts`
- **Gate**: type
- acceptance:
  - Entering a unit in a project with a lockfile installs its dependencies into the worktree with the project's package manager, scripts disabled, or says in the entry's answer that it could not and the command that will; the first publish no longer fails on a missing module.

## acceptance

- azur-lx's start-up log, replayed, shows none of these departures.
- New findings from consumer projects outside the dogfood configuration are added here as slices.
