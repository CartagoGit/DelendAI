---
id: x00735
title: "A unit of work is one engine, in core"
kind: fix
status: in-progress
type: proposal
track: hosts
date: 2026-09-28
priority: P0
related: [x00714, x00722, x00727, x00731]
---

# x00735 — A unit of work is one engine, in core

## goal

Entering, checkpointing, claiming and publishing a unit of work is one
engine in `@delendai/core`, which every surface calls: the CLI's `work`
command now, the MCP `work` tool next. The project's development policy
is read one way, by every reader.

## why

The owner asked for a review of whether delendai works the same whatever
host or model drives it. Two findings:

- **The unit lifecycle existed only in the CLI** (`work.command.ts` and a
  dozen services under `packages/cli`). A host that reaches delendai only
  through MCP (a chat client with no terminal) could read the review queue
  and record verdicts, but never enter, claim or publish a unit. The
  engine was CLI code by accident: it depends only on core.
- **Core and the CLI read the policy differently.** The CLI read
  `delendai.config.json` as JSONC and discovered the integration branch
  when none is declared. Core's write guard and its unit check (x00722)
  used `JSON.parse` and the `develop` default. In a project whose config
  has a comment, or whose trunk is `main` and undeclared, the guard let
  every write into the shared checkout through, and the auto-commit never
  recognised a unit.

## why this design

- **Moved, not rewritten.** The engine and its services move to
  `packages/core/src/lib/work-units/` with their specs, split by operation
  (enter, generation, publish, claim, checkpoint, status) to keep each
  module under the size limit. `runWorkUnit(args, ctx)` is the entry; the
  CLI's `work` command is `runWorkUnit`, and its behaviour is unchanged
  (every moved spec passes as it did).
- **One set of contracts.** `EXIT_CODE`, the unit context and result, and
  the flag and config readers (`scalarArg`, `isRecord`, `readConfigText`)
  live in core; the CLI re-exports them.
- **One policy reader.** `integrationCheckoutRefusal` and `unitBranchOf`
  read the policy through `readWorkspacePolicy` (JSONC, discovered trunk).
- Names that collided with existing core ones are made one: `readConfigText`,
  `isRecord` and `shortName` each have one implementation; the unit
  publication is `publishWorkUnit`, distinct from `publishWorkRef`.
- Four public exports only the CLI used leave the public barrel
  (`holdWorkRef`, `defaultBranchOf`, `checkedOutBranch`,
  `sanitizeRefComponent`).
- The worktree agent stamp keeps synchronous file access: the git guard
  that reads it is a one-shot hook process. It is listed among the boot
  exemptions of the sync-fs rule, with that reason.
- Older proposals name the moved files at their CLI paths, which is what
  they shipped; the proposal-files baseline records the move.

## non-goals

- The MCP `work` tool and the review flow over MCP: the next proposals,
  on this engine.

## architecture

- `packages/core/src/lib/work-units/` (engine, services, command-args helper).
- `packages/core/src/cli.ts`: the engine and its readers for the CLI.
- `packages/cli/src/commands/work.command.ts`: `runWorkUnit`.

## Slices

- global_gate: none

### S1 — The engine moves to core; one policy reader

- **Status**: in-progress
- **Gate**: `npx vitest run packages/core/tests/src/lib/work-units packages/core/tests/src/lib/development-policy`
- **Files**:
  - `packages/cli/src/commands/guard.command.ts`
  - `packages/cli/src/commands/repair.command.ts`
  - `packages/cli/src/commands/review.command.ts`
  - `packages/cli/src/commands/work.command.ts`
  - `packages/cli/src/contracts/constants/exit-code.constant.ts`
  - `packages/cli/src/contracts/interfaces/exit-code.interface.ts`
  - `packages/cli/src/index.ts`
  - `packages/cli/src/lib/command-flags.service.spec.ts`
  - `packages/cli/src/lib/config-file.service.ts`
  - `packages/cli/src/lib/helpers/cli-command.helper.ts`
  - `packages/core/src/cli.ts`
  - `packages/core/src/lib/bootstrap/merge-derived-config.ts`
  - `packages/core/src/lib/contracts/constants/exit-code.constant.ts`
  - `packages/core/src/lib/contracts/constants/publication-target.constant.ts`
  - `packages/core/src/lib/contracts/constants/work-publish.constant.ts`
  - `packages/core/src/lib/contracts/constants/worktree-agent.constant.ts`
  - `packages/core/src/lib/contracts/interfaces/exit-code.interface.ts`
  - `packages/core/src/lib/contracts/interfaces/publication-pull-request.interface.ts`
  - `packages/core/src/lib/contracts/interfaces/publication-target.interface.ts`
  - `packages/core/src/lib/contracts/interfaces/scope-collision.interface.ts`
  - `packages/core/src/lib/contracts/interfaces/work-briefing.interface.ts`
  - `packages/core/src/lib/contracts/interfaces/work-claim.interface.ts`
  - `packages/core/src/lib/contracts/interfaces/work-dirty-paths.interface.ts`
  - `packages/core/src/lib/contracts/interfaces/work-publish.interface.ts`
  - `packages/core/src/lib/contracts/interfaces/work-ref-shape.interface.ts`
  - `packages/core/src/lib/contracts/interfaces/work-swarm.interface.ts`
  - `packages/core/src/lib/contracts/interfaces/work-unit-context.interface.ts`
  - `packages/core/src/lib/contracts/interfaces/workflow-invariants.interface.ts`
  - `packages/core/src/lib/development-policy/project-branches.ts`
  - `packages/core/src/lib/scan/dip-violation.ts`
  - `packages/core/src/lib/shared/is-record.ts`
  - `packages/core/src/lib/work-units/command-args.helper.ts`
  - `packages/core/src/lib/work-units/development-policy.service.ts`
  - `packages/core/src/lib/work-units/proposal-branch.service.ts`
  - `packages/core/src/lib/work-units/publication-pull-request.service.ts`
  - `packages/core/src/lib/work-units/publication-target.service.ts`
  - `packages/core/src/lib/work-units/scope-collision.service.ts`
  - `packages/core/src/lib/work-units/work-briefing.service.ts`
  - `packages/core/src/lib/work-units/work-claim.service.ts`
  - `packages/core/src/lib/work-units/work-dirty-paths.service.ts`
  - `packages/core/src/lib/work-units/work-publish.service.ts`
  - `packages/core/src/lib/work-units/work-ref-shape.service.ts`
  - `packages/core/src/lib/work-units/work-swarm.service.ts`
  - `packages/core/src/lib/work-units/work-unit-checkpoint.service.ts`
  - `packages/core/src/lib/work-units/work-unit-claim.service.ts`
  - `packages/core/src/lib/work-units/work-unit-enter.service.ts`
  - `packages/core/src/lib/work-units/work-unit-generation.service.ts`
  - `packages/core/src/lib/work-units/work-unit-publish.service.ts`
  - `packages/core/src/lib/work-units/work-unit-shared.service.ts`
  - `packages/core/src/lib/work-units/work-unit-status.service.ts`
  - `packages/core/src/lib/work-units/work-unit.service.ts`
  - `packages/core/src/lib/work-units/workflow-doctor.service.ts`
  - `packages/core/src/lib/work-units/workflow-invariants.service.ts`
  - `packages/core/src/lib/work-units/worktree-agent.service.ts`
  - `packages/core/src/lib/workspace-migration/config-transitions.service.ts`
  - `packages/core/src/public/index.ts`
  - `packages/core/tests/src/lib/development-policy/project-branches.spec.ts`
  - `packages/core/tests/src/lib/wip-engine/work-checkout-publisher.spec.ts`
  - `packages/core/tests/src/lib/work-units/development-policy.service.spec.ts`
  - `packages/core/tests/src/lib/work-units/proposal-branch.service.spec.ts`
  - `packages/core/tests/src/lib/work-units/publication-pull-request.service.spec.ts`
  - `packages/core/tests/src/lib/work-units/publication-target.service.spec.ts`
  - `packages/core/tests/src/lib/work-units/scope-collision.service.spec.ts`
  - `packages/core/tests/src/lib/work-units/work-briefing.service.spec.ts`
  - `packages/core/tests/src/lib/work-units/work-claim.service.spec.ts`
  - `packages/core/tests/src/lib/work-units/work-dirty-paths.service.spec.ts`
  - `packages/core/tests/src/lib/work-units/work-publish.service.spec.ts`
  - `packages/core/tests/src/lib/work-units/work-ref-shape.service.spec.ts`
  - `packages/core/tests/src/lib/work-units/work-swarm.service.spec.ts`
  - `packages/core/tests/src/lib/work-units/work-unit.service.spec.ts`
  - `packages/core/tests/src/lib/work-units/workflow-invariants.service.spec.ts`
  - `packages/core/tests/src/lib/work-units/worktree-agent.service.spec.ts`
  - `tools/scripts/lint/core-public-consumers.baseline.json`
  - `tools/scripts/lint/proposal-files-exist.baseline.json`

## dependency graph

None.

## acceptance

- `delendai work enter|publish|checkpoint|claim|status` behave as before;
  every moved spec passes in core.
- A project on `main`, undeclared, with a comment in its config: a write
  into its shared checkout is refused.
