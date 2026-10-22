---
id: x00915
title: "What is repeated comes from one place"
kind: fix
status: review
type: proposal
track: general
date: 2026-10-18
last-transition-id: 1e509559-7fdb-42a5-a9b4-ece032743aba
last-correlation-id: 1e509559-7fdb-42a5-a9b4-ece032743aba
last-transition-from: in-progress
last-transition-at: 2026-10-18T11:03:50.084Z
---

# x00915 — What is repeated comes from one place

## goal

Facts and helpers the codebase repeats by hand are read from one source, so every component acts the same way and a fix lands everywhere at once. Each slice is one such fact, found while working and measured against `develop`.

## why

The owner, 2026-10-18: "con unicas fuentes de la verdad para que todos actúen de la misma manera". Copies drift: the first one found here already disagrees with itself.

- **The git variables a hook leaks.** `HOOK_GIT_ENVIRONMENT` (`packages/core/src/lib/contracts/constants/hook-git-environment.constant.ts`) and `hookFreeEnvironment` (`packages/core/src/lib/shared/hook-free-environment.helper.ts`, exported from `@delendai/core/cli`) exist, yet six places strip the variables themselves: `packages/core/src/lib/work-units/forge-work-refs.service.ts` and `hidden-work.service.ts` loop over the constant, `packages/cli/src/lib/generated-refresh.service.ts` keeps its own list, and `tools/scripts/git/hydrate-candidates-after-merge.script.ts`, `refresh-candidate-artifacts.script.ts` and `maintain-ref-namespace.script.ts` each spell the five names out. The CLI's list also strips `GIT_OBJECT_DIRECTORY` and `GIT_ALTERNATE_OBJECT_DIRECTORIES`, which a `pre-receive` hook's quarantine sets; the other five places do not.

## non-goals

- Changing behaviour beyond making every copy the union the strictest one already applies.

## slices

- global_gate: type

### S1 — One list of what a hook leaks

- **Status**: review
- **Files**:
  - `packages/core/src/lib/contracts/constants/hook-git-environment.constant.ts`
  - `packages/core/src/lib/work-units/forge-work-refs.service.ts`
  - `packages/core/src/lib/work-units/hidden-work.service.ts`
  - `packages/core/src/runtime/index.ts`
  - `packages/cli/src/lib/generated-refresh.service.ts`
  - `tools/scripts/git/hydrate-candidates-after-merge.script.ts`
  - `tools/scripts/git/refresh-candidate-artifacts.script.ts`
  - `tools/scripts/git/maintain-ref-namespace.script.ts`
- **Gate**: type
- acceptance:
  - "`HOOK_GIT_ENVIRONMENT` lists every variable any copy stripped (the object-directory pair included), and the six places strip through `hookFreeEnvironment` (exported from `@delendai/core/runtime` too, for scripts) instead of their own loop or list; no other list of these names remains in source (`grep -rn \"'GIT_DIR'\" packages plugins tools` finds only the constant)."
- review-state: in_review
- review-implementer: claude-opus-5-5
- shipped-in: `8b09da09fb4e`

## acceptance

- Every fact a slice names is read from one source.
