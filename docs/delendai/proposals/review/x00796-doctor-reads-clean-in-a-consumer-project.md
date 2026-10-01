---
id: x00796
title: "Doctor reads clean in a consumer project"
kind: fix
status: review
type: proposal
track: trust
date: 2026-10-01
last-transition-id: 85d50588-fa1c-4fdc-ab83-781af35d2a10
last-correlation-id: 85d50588-fa1c-4fdc-ab83-781af35d2a10
last-transition-from: in-progress
---

# x00796 — Doctor reads clean in a consumer project

## Goal

A freshly initialised consumer project's doctor reports no warnings for checks that only apply to the delendai monorepo; those checks report not-applicable, and tool-assuming checks follow the project's own package manager.

## why

A probe of the real CLI in throwaway consumer repos found that after `init`, `delendai doctor` still warned on checks that only describe the delendai monorepo: manifests, plugin-graph, deps (no `bun.lock`), token-budgets, runtime (no `engines.bun`), schemas, and the standing network-surfaces skip. A healthy consumer never read clean, and the warnings taught users to ignore the report.

## non-goals

- Doctor findings about the delendai source checkout itself (its dangling workspace dependencies, unknown permissions) are untouched.
- No new core public export: the source-checkout signal is the root package name core's bootstrap already uses.

## Slices

- global_gate: none

### S1 — Gate monorepo-only doctor checks and derive deps and runtime from the project
- **Status**: done
- **Files**: `packages/cli/src/lib/doctor/applicability.ts`, `packages/cli/src/lib/doctor/applicability.spec.ts`, `packages/cli/src/lib/doctor/analyze-config-roots.service.ts`, `packages/cli/src/lib/doctor/checks/manifests.check.ts`, `packages/cli/src/lib/doctor/checks/plugin-graph.check.ts`, `packages/cli/src/lib/doctor/checks/deps.check.ts`, `packages/cli/src/lib/doctor/checks/runtime.check.ts`, `packages/cli/src/lib/doctor/checks/schemas.check.ts`, `packages/cli/src/lib/doctor/checks/token-budgets.check.ts`, `packages/cli/src/lib/doctor/checks/network.check.ts`, `packages/cli/src/commands/doctor-checks/plugin-graph.ts`, `packages/cli/src/commands/groups/doctor.ts`, `packages/cli/src/commands/doctor.spec.ts`, `packages/cli/src/commands/groups/doctor.spec.ts`
- **Gate**: none
- shipped-in: `e59cea102e36`

## acceptance

- manifests, plugin-graph, token-budgets and schemas report `not-applicable` unless the workspace root package is `@delendai/core-monorepo`; they still run and still warn there.
- deps accepts bun, npm, pnpm or yarn lockfiles, is not applicable without a package.json, and still warns on a project that declares dependencies and has no lockfile.
- runtime enforces `engines.bun` or `engines.node` when declared and is not applicable otherwise.
- `not-applicable` is its own status: shown as such, never rolled up as ok, never scored as a problem.
- `init:default` then `doctor` in a consumer repo (npm, pnpm, bun, no package.json) exits 0 with Health 100/100.
