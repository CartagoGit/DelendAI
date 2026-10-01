---
id: x00795
title: "The core public surface is back under budget and the gate runs in CI"
kind: fix
status: ready
type: proposal
track: trust
date: 2026-10-01
priority: P0
related: [x00644, x00541, x00672]
tags:
    - gates
    - public-surface
---

# x00795 — The core public surface is back under budget and the gate runs in CI

## goal

`bun run lint:core-public-surface-budget` passes on develop without raising
the budget, and it runs in CI so the next export over the line fails the
pull request that adds it.

## why

`bun run validate` was red on develop: 648 exports from
`@delendai/core/public` against a budget of 645. The proposal closing and
review hand-off tools require green validate evidence, so every proposal was
blocked. The gate lived only in `validate:run`, and `lints-reach-ci` recorded
it as an accepted unreachable lint in its baseline, so CI never saw it.

## non-goals

- Raising the budget.
- Editing the branches of open pull requests.

## slices

### S1 — Move host-only exports to the cli entry, drop restated constants, wire the gate

- **Status**: ready
- **Gate**: `bun run lint:core-public-surface-budget && bun run lint:core-public-consumers && bun run lint:lints-reach-ci`
- **Files**:
  - `packages/core/src/public/index.ts`
  - `packages/core/src/cli.ts`
  - `packages/core/src/lib/development-policy/protected-branches.ts`
  - `plugins/commit-policy/src/lib/services/push-driver.ts`
  - `plugins/git/src/lib/tools/write-tools.ts`
  - `plugins/proposals/src/lib/tools/auto-work-persist.ts`
  - `tools/scripts/host/host-supervisor-process.ts`
  - `tools/scripts/verify/verify-probes.ts`
  - `tools/scripts/lint/core-public-surface-budget.script.ts`
  - `tools/scripts/lint/lints-reach-ci.script.ts`
  - `tools/scripts/lint/lints-reach-ci.baseline.json`
  - `package.json`
- acceptance:
  - "The barrel exports at most 645 symbols, with the budget unchanged."
  - "createStaleRuntimeWatch and SHARED_CHECKOUT_WRITE_REFUSED are read from @delendai/core/cli by the host and the verify script."
  - "lint:core-public-surface-budget is chained into lint:architecture and absent from the lints-reach-ci baseline."

## acceptance

- The public export count is at or under 645 and the typecheck passes across the monorepo.
- The gate is reachable from CI.
