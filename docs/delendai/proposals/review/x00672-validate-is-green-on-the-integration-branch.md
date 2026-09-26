---
id: x00672
title: "Validate is green on the integration branch"
kind: fix
status: review
type: proposal
track: trust
date: 2026-09-26
priority: P0
related: [x00658, f00644, x00659]
last-transition-id: f8054db1-969b-411a-bd96-ec5e6780869a
last-correlation-id: f8054db1-969b-411a-bd96-ec5e6780869a
last-transition-from: in-progress
---

# x00672 — Validate is green on the integration branch

## goal

`bun run validate` passes on develop again. The proposal closing tools
require it whenever no integration certification vouches for a close,
and they can close proposals again.

## why

On 2026-09-26, closing an independently approved proposal was refused:
"the most recent validate run FAILED". The run failed on four steps that
CI does not run, so develop looked green while local validate had been
red for nine days, since 2026-09-17:

- `commit-driver-guard`: two commit-policy services called `update-ref`
  directly (x00658's `integrated-work-refs` and `work-ref-checkpoint`),
  outside `commit-driver.ts`, the plugin's one owner of ref writes.
- `lint:cache`: validate's own run of the commit-policy tests, from the
  plugin's folder, left a stray `plugins/commit-policy/.cache`. The
  plugin resolved its storm log against the process's cwd, and specs
  passed a relative cache dir. A server started anywhere but the
  workspace root would write storms there too.
- `core-public-surface-budget`: 1081 exports against a budget of 1080,
  and f00644 added four more.
- `proposal-cited-commits`: only when a review batch closed x00546,
  which cites SHAs of deliberately discarded branches. x00546 is held
  back for the maintainer's decision.

## why this design

- **One owner of ref writes.** `compareAndSwapRef` in `commit-driver.ts`
  is the plugin's only `update-ref`. The two services call it, and the
  guard is not weakened.
- **Context paths resolve against the workspace.** The storm log's
  directory is `resolve(ctx.workspace.root, ctx.pluginCacheDir)`. The
  engine spec uses a private temporary directory.
- **Shrink the surface, do not raise the budget.** f00644's four naming
  exports are one concept, and become one: `WORK_REF_NAMING`. Three
  aliases that nothing uses (`IWriteGitRunner`, `IWriteGitRunResult`,
  `computeMemoryUtility`) are removed; the `@adopter-api` exports stay.
  1085 → 1079.

## non-goals

- Running these lints in CI. That is a separate question: why a local
  gate that closing tools depend on can stay red unseen.

## architecture

- `plugins/commit-policy/src/lib/services/commit-driver.ts`,
  `integrated-work-refs.service.ts`, `work-ref-checkpoint.service.ts`,
  `src/index.ts`.
- `packages/core/src/lib/contracts/constants/work-ref-naming.constant.ts`,
  `packages/core/src/public/index.ts`, and the plugins that read it.

## Slices

- global_gate: none

### S1 — The four validate failures are fixed at their cause

- **Status**: review
- **Gate**: `bun run lint:commit-driver-guard && bun run lint:cache && bun run lint:core-public-surface-budget`
- **Files**:
  - `plugins/commit-policy/src/lib/services/commit-driver.ts`
  - `plugins/commit-policy/src/lib/services/integrated-work-refs.service.ts`
  - `plugins/commit-policy/src/lib/services/work-ref-checkpoint.service.ts`
  - `plugins/commit-policy/src/index.ts`
  - `plugins/commit-policy/src/lib/engine.spec.ts`
  - `packages/core/src/lib/contracts/constants/work-ref-naming.constant.ts`
  - `packages/core/src/public/index.ts`
  - `plugins/commit-policy/src/lib/contracts/constants/work-ref.constant.ts`
  - `plugins/commit-policy/src/lib/persistence/wip-persistence.ts`
  - `plugins/commit-policy/src/lib/services/work-ref-policy.service.ts`
  - `plugins/proposals/src/lib/contracts/constants/review-claims.constant.ts`
  - `plugins/proposals/src/lib/tools/publish-proposal.ts`
  - `packages/cli/src/lib/publication-target.service.ts`
- review-state: in_review
- review-implementer: claude-opus-5-5
## dependency graph

None.

## acceptance

- `lint:commit-driver-guard`, `lint:cache` (after the commit-policy
  suite runs from its own folder) and `lint:core-public-surface-budget`
  pass.
- A full `bun run validate` on this tree passes.
