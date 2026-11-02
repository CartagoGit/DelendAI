---
id: x00663
title: "The guard runs where lefthook owns the hooks"
kind: fix
status: done
type: proposal
track: trust
date: 2026-09-26
priority: P2
related: [x00653]
last-transition-id: 32c4db2f-221a-42df-9d27-e2adf1513a1b
last-correlation-id: 32c4db2f-221a-42df-9d27-e2adf1513a1b
last-transition-from: review
shipped-in:
  - "7e1172378f8c0c04aa75864621d7f8c1b5a20c80"
---

# x00663 — The guard runs where lefthook owns the hooks

## goal

The boot report says the truth about the guard hooks, and gives advice
a lefthook project can follow. This repository runs the product's
guard on every hook the development policy covers. The guard's refusal
names the route an agent should take.

## why

Every boot on 2026-09-26 printed `pre-commit: absent`, `pre-push:
absent`, `post-merge: absent — run \`delendai guard install\``:

- `post-merge` was wrong. lefthook already runs `delendai guard
  post-merge`, but the report only recognised the block `guard install`
  writes into `.git/hooks`, and lefthook regenerates those files.
- `pre-commit` and `pre-push` were right. lefthook did not run the guard
  there.
- The advice was wrong for this project. The product's own drift check
  says `guard install` is unsupported under lefthook: the command belongs
  in `lefthook.yml`.

A warning that is wrong every boot teaches everyone to ignore it.

The guard's refusal for a work-ref profile also told the agent "Do not
create worktrees or branches", with no route. Since x00653 a write into
the shared checkout on the integration branch is refused, and the canonical
route is `delendai work enter`, which makes the unit's worktree.

## why this design

- `inspectGuardHooks` counts a hook as guarded when lefthook runs `guard
  <hook>` in that hook's own section. `guard post-merge` elsewhere does
  not count. A lefthook-owned hook without it is `absent`, with the
  lefthook reason. The boot suggests `guard install` only for hooks that
  carry no reason of their own.
- `lefthook.yml` runs `delendai guard pre-commit` and `delendai guard
  pre-push` (with `use_stdin`: the pushed refs exist only on stdin). They
  run beside this repository's own stricter rules
  (`refuse-integration-commit`, `push-to-develop-discipline`), which apply
  to everyone. The guard governs agents only. Measured as an agent: it
  refuses a commit on `develop` in the shared checkout and a push to
  `develop`, and allows a commit in a worktree, a push to `pr/` and a
  deletion of a `wip/` ref.
- `describeWorkIsolation`, the one statement of the isolation rule, says
  "by hand" and, under a work-ref profile, names `delendai work enter`,
  `checkout` and `delendai work publish`.

## non-goals

- Replacing this repository's own hook rules with the guard.

## architecture

- `packages/cli/src/lib/guard-hooks.service.ts`: `lefthookRunsGuard`,
  lefthook-aware `inspectGuardHooks`.
- `packages/cli/src/lib/guard-hooks-autoinstall.service.ts`: the advice.
- `packages/core/src/lib/development-policy/work-isolation.ts`: the
  route.
- `lefthook.yml`: the two commands.

## Slices

- global_gate: none

### S1 — The report tells the truth, and the guard names the route

- **Status**: done
- **Gate**: `npx vitest run packages/cli/src/lib/guard-hooks.service.spec.ts packages/cli/src/lib/guard-hooks-autoinstall.service.spec.ts packages/core/tests/src/lib/development-policy/work-isolation.spec.ts`
- **Files**:
  - `packages/cli/src/lib/guard-hooks.service.ts`
  - `packages/cli/src/lib/guard-hooks-autoinstall.service.ts`
  - `packages/core/src/lib/development-policy/work-isolation.ts`
  - `lefthook.yml`
  - `packages/cli/src/lib/guard-hooks.service.spec.ts`
  - `packages/cli/src/lib/guard-hooks-autoinstall.service.spec.ts`
  - `packages/core/tests/src/lib/development-policy/work-isolation.spec.ts`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: glm-5.3-max
- review-log: approved by glm-5.3-max — Revisé la entrega real 7e1172378. El guard reconoce los hooks que LEFTHOOK posee: un hook cuya sección lefthook ejecuta `guard <hook>` se reporta installed; un hook owned-por-lefthook sin ese comando es absent y el reporte apunta a lefthook.yml (no a guard install — el instalador no es dueño ahí); en este repo los tres hooks lefthook leen installed; bajo shared-checkout-pr/merge la regla de aislamiento nombra delendai work enter y bajo shared-direct no. guard-hooks.service +50, autoinstall +5 con specs (+29/+33), work-isolation ajustado. Acceptance cubierta; gates 24/24 + 11/11 en el lote del pack. Sin cambios fuera de alcance.
## dependency graph

None.

## acceptance

- A hook whose lefthook section runs `guard <hook>` is `installed`.
- A lefthook-owned hook without that command is `absent`, and the report
  points to `lefthook.yml`, not to `guard install`.
- On this repository all three lefthook hooks read `installed`.
- Under `shared-checkout-pr` and `shared-checkout-merge` the isolation
  rule names `delendai work enter`; under `shared-direct` it does not.
