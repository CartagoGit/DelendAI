---
id: f00554
title: "A project decides how work becomes pull requests: by slice, by proposal, or adaptively"
kind: feat
status: done
type: proposal
track: workflow
date: 2026-09-24
shipped-in:
  - "c713706a9"
  - "03deea8d1"
  - "a5710d85a2377223d803d3dcd108fc1ff5627a0a"
  - "2d26f731d8dfcb3bb1d5ba09d0b2e1dbacc73957"
---

# f00554 — A project decides how work becomes pull requests: by slice, by proposal, or adaptively

## goal

The granularity of pull requests is a project decision with one
declared value: `slice` (one pull request per slice), `proposal` (one per
finished proposal), or `adaptive`, which decides from the size of the
proposal. **`adaptive` is the default**, here and in every adopting
project.

## why

Today the granularity is whatever the agent happens to do. In this
repository the same session opened one pull request carrying two
proposals (#362: x00608 + x00620), one per proposal (#363, #365, #366),
and one for six slices of one proposal (#367). Each choice was
defensible, but none was a policy, so a reviewer cannot predict what a
pull request will contain, and the swarm cannot reason about it.

Both fixed extremes have a cost. One PR per slice floods the queue: each
PR pays its own CI run, hydration and merge commit, and merge commits
were already about half of recent history. One PR per proposal makes a
large proposal an unreviewable batch, and holds finished slices back
until the last one is done.

## why this design

- **Declared once**, in the development policy:
  `development.publication.granularity: 'slice' | 'proposal' | 'adaptive'`,
  resolved by the same resolver as every other development field.
- **`adaptive` is a small, deterministic rule, not a heuristic hidden in
  an agent's head.** A proposal is published as one pull request when it
  is small (by default at most 3 slices and at most 400 changed lines
  across them), and slice by slice otherwise. Both thresholds are part of
  the declared value (`adaptive: { maxSlices, maxChangedLines }`), so a
  project tunes them rather than overriding the rule.
- **The decision is visible**: `work status` and the publish step report
  which granularity applied and why ("3 slices, 212 lines: one pull
  request for x00622").
- **Independent of work-in-progress visibility** (f00553). Work refs show
  progress; granularity decides only how that progress becomes pull
  requests.

## non-goals

- Changing what a pull request must pass.
- Mixing proposals in one pull request. That is never a granularity; the
  rule only groups slices of the same proposal.

## Slices

- global_gate: none

### S1 — The policy field and the adaptive rule

- **Status**: done
- **Gate**: `npx vitest run packages/core/tests/src/lib/development-policy`
- **Files**: `packages/core/schema/delendai.config.schema.json`,
  `packages/core/src/lib/contracts/constants/publication-granularity.constant.ts`,
  `packages/core/src/lib/contracts/interfaces/development-policy.interface.ts`,
  `packages/core/src/lib/contracts/interfaces/publication-unit.interface.ts`,
  `packages/core/src/lib/development-policy/profiles.ts`,
  `packages/core/src/lib/development-policy/publication-unit.ts`,
  `packages/core/src/lib/development-policy/resolve.interface.ts`,
  `packages/core/src/lib/development-policy/resolve.ts`,
  `packages/core/src/lib/plugins/development-config-schema.constant.ts`,
  `packages/core/tests/src/lib/development-policy/publication-unit.spec.ts`
- `granularity` resolves with `adaptive` as the default. A pure
  `publicationUnitFor(proposal, policy)` answers `slice` or `proposal`,
  with the reason, and is tested at both thresholds.
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-3
- review-log: approved by minimax-3 — Independiente: implementer claude-opus-5-5, reviewer minimax-3. Verifiqué a5710d85a2. PR MERGED. The policy field and the adaptive rule
- review-attribution: claude-opus-5-5 from commit a5710d85a237 names refs/heads/delendai/wip/claude-opus-5-5/f00554-S1-g1/a-project-declares-how-work-becomes-pull-requests (a5710d85a2377223d803d3dcd108fc1ff5627a0a), opened by minimax-3
### S2 — Publishing follows the declared unit

- **Status**: done
- **DependsOn**: [S1]
- **Gate**: `npx vitest run packages/cli/src/lib`
- **Files**: `packages/cli/src/commands/work.command.ts`,
  `packages/cli/src/contracts/constants/publication-target.constant.ts`,
  `packages/cli/src/contracts/interfaces/publication-target.interface.ts`,
  `packages/core/src/lib/work-units/publication-target.service.ts`,
  `packages/core/tests/src/lib/work-units/publication-target.service.spec.ts`,
  `packages/core/src/public/index.ts`,
  `tools/scripts/lint/core-public-surface-budget.script.ts`
- `work publish` groups the slices of a proposal into one publication ref
  or publishes each one separately, as the rule decides, and refuses to
  put two proposals into one pull request.
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-3
- review-log: approved by minimax-3 — Independiente: implementer claude-opus-5-5, reviewer minimax-3. Verifiqué 2d26f731d8. PR MERGED. Publishing follows the declared unit
- review-attribution: claude-opus-5-5 from commit 2d26f731d8df names refs/heads/delendai/wip/claude-opus-5-5/f00554-all-g1/the-unit-reads-the-proposal-from-the-work (2d26f731d8dfcb3bb1d5ba09d0b2e1dbacc73957), opened by minimax-3
### S3 — The unit is decided from the proposal in the work being published

- **Status**: done
- **Gate**: `npx vitest run packages/cli/src/lib/publication-target.service.spec.ts`
- **Files**: `packages/core/src/lib/work-units/publication-target.service.ts`,
  `packages/core/tests/src/lib/work-units/publication-target.service.spec.ts`
- Found on 2026-09-24 by the first unit published through `work publish`
  (x00635): the decision counted slices in the shared checkout's HEAD,
  where a proposal written in the work does not exist yet, so every new
  proposal was published alone "because its size is unknown". It now
  reads the proposal from the tree of the work ref.
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-3
- review-log: approved by minimax-3 — Independiente: implementer claude-opus-5-5, reviewer minimax-3. Verifiqué c713706a9. PR MERGED. The unit is decided from the proposal in the work being published
- review-attribution: claude-opus-5-5 from commit c713706a9f2a names refs/heads/delendai/wip/claude-opus-5-5/f00554-S1-g1/a-project-declares-how-work-becomes-pull-requests (c713706a9f2a10bde2dcdd9cf1881d21902fb2b9), opened by minimax-3
## acceptance

- With the default, a 2-slice proposal becomes one pull request and a
  7-slice proposal becomes pull requests slice by slice, each stating why.
- A project that declares `slice` or `proposal` gets that, always.
- No pull request ever carries two proposals.
