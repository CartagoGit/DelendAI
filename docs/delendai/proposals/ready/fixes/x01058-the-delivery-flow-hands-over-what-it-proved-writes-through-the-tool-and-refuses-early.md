---
id: x01058
title: "The delivery flow hands over what it proved, writes through the tool, and refuses early"
kind: fix
status: ready
type: proposal
track: general
date: 2026-11-10
---

# x01058 — The delivery flow hands over what it proved, writes through the tool, and refuses early

## goal

`work deliver` hands over only the slice it proved, refuses in seconds what it would refuse after the proof, commits its own writes under the tool's subject, and the verdict lint, review CLI, owned-namespace reading and unit entry agree with that flow.

## why

On 2026-11-10 delivering one slice of a multi-slice proposal moved the whole proposal to review and was refused after a 5-minute proof (S3, S4, S6 undelivered); deliver left its own transition uncommitted and then refused the dirty tree; the startup reconciler committed an uncommitted proposal_transition write as `chore(wip): keep the uncommitted work found at start` (c8a5c88f0, transition 0f533c39 on f00808 S8) so lint:verdicts-through-the-tool rejected the review lines as hand-written; `review approve` without --session entered a new empty review unit; carried-work.service derived the owned namespaces itself; and a freshly entered unit failed its proof late for lack of dependencies.

## non-goals

- Changing who may judge a slice or what a verdict needs.
- Accepting arbitrary hand-edited review lines in the verdict lint.
- Replacing the unit dependency linking; only completeness is checked.

## slices

- global_gate: type

### S1 — Deliver hands over only the slice it proved
- **Status**: pending
- **Files**: `packages/cli/src/lib/work-deliver.service.ts`, `packages/cli/src/lib/work-deliver.service.spec.ts`, `packages/cli/src/contracts/interfaces/work-deliver.interface.ts`, `plugins/proposals/src/lib/services/review-entry.service.ts`, `plugins/proposals/tests/src/lib/services/review-entry.service.spec.ts`
- **Gate**: type
- acceptance:
  - "`work deliver --slice=X` passes the slice to the review transition, which checks declared files and delivery commits of that slice only."
  - "With other slices undelivered, deliver leaves the proposal in progress and reports which slices remain; the last slice moves it to review."
  - "[<Nms] specs cover: one slice delivered of three, all delivered, and a whole-proposal deliver unchanged."

### S2 — Deliver runs the hand-over preflight before the proof
- **Status**: pending
- **DependsOn**: [S1]
- **Files**: `packages/cli/src/lib/work-deliver-preflight.service.ts`, `packages/cli/src/lib/work-deliver-preflight.service.spec.ts`, `packages/cli/src/commands/work.command.ts`, `packages/cli/src/commands/work.command.spec.ts`
- **Gate**: type
- acceptance:
  - "Declared-files existence and undelivered-slice checks (prepareReviewEntry) run before `prove`; a refusal arrives in seconds with the proof not started."
  - "The preflight is read-only and uses the same function as the transition, so the two cannot disagree."
  - "[<Nms] spec: a missing declared file refuses with prove never called."

### S3 — Deliver commits its own writes before the proof
- **Status**: pending
- **DependsOn**: [S1]
- **Files**: `packages/cli/src/lib/work-deliver-commit.service.ts`, `packages/cli/src/lib/work-deliver-commit.service.spec.ts`
- **Gate**: type
- acceptance:
  - "After the in-progress transition deliver commits the tree change itself with a `chore(delendai): <tool> …` subject, so the proof sees a clean tree."
  - "Nothing but the tool's own write is committed; a foreign dirty file is left and the proof refuses it as before."
  - "[<Nms] spec covers a clean write, a foreign dirty file, and nothing written."

### S4 — A reconciler keep commit may carry a tool-recorded verdict
- **Status**: pending
- **Files**: `tools/scripts/lint/verdicts-through-the-tool.script.ts`, `tools/scripts/lint/verdicts-through-the-tool.script.spec.ts`
- **Gate**: lint
- acceptance:
  - "A commit with the subject `chore(wip): keep the uncommitted work found at start` is accepted only when its review lines come with a `last-transition-id` the tool recorded (verified where transitions are recorded); any other hand edit still fails."
  - "The spec reproduces the shape of c8a5c88f0 (transition 0f533c39) both accepted and, with an unrecorded id, refused."
  - "A tool's write is never left uncommitted: it is committed by the tool (S3), which is the preferred path."

### S5 — Review approve and release reuse the open review unit
- **Status**: pending
- **Files**: `packages/cli/src/commands/review.command.ts`, `packages/cli/src/commands/review.command.e2e.spec.ts`
- **Gate**: type
- acceptance:
  - "`review approve` and `review release` without --session enter the agent's open review unit instead of a new one."
  - "No empty review unit is left behind by a command that finds one."
  - "e2e spec: two calls without --session use one unit."

### S6 — carried-work reads the owned namespaces from the decisions module
- **Status**: pending
- **Files**: `plugins/proposals/src/lib/services/carried-work.service.ts`, `plugins/proposals/tests/src/lib/services/carried-work.service.spec.ts`, `packages/core/src/lib/integration/decisions/namespaces.helper.ts`, `tools/scripts/lint/integration-decisions-single-owner.script.ts`, `tools/scripts/lint/integration-decisions-single-owner.spec.ts`
- **Gate**: lint
- acceptance:
  - "retiredRoots comes from the decisions module (a helper beside ownedNamespaces); carried-work derives nothing itself."
  - "lint:integration-decisions refuses code that builds retired roots or namespace-derived `refs/<namespace>/…` prefixes outside the module."
  - "[<Nms] spec: the lint flags the old carried-work shape and passes the new one."

### S7 — Entering a unit installs what the worktree lacks
- **Status**: pending
- **Files**: `packages/core/src/lib/work-units/unit-dependencies.service.ts`, `packages/core/tests/src/lib/work-units/unit-dependencies.service.spec.ts`
- **Gate**: type
- acceptance:
  - "A worktree whose node_modules is present but missing a declared dependency is installed (the project's declared package manager, frozen lockfile), on enter and re-entry."
  - "The install command table is the one the proof's temporary worktree uses; no second list."
  - "[<Nms] spec: complete modules are left alone, incomplete ones installed, no lockfile skipped."

## acceptance

- `work deliver --slice=X` passes the slice to the review transition, which checks declared files and delivery commits of that slice only.
- With other slices undelivered, deliver leaves the proposal in progress and reports which slices remain; the last slice moves it to review.
- [<Nms] specs cover: one slice delivered of three, all delivered, and a whole-proposal deliver unchanged.
- Declared-files existence and undelivered-slice checks (prepareReviewEntry) run before `prove`; a refusal arrives in seconds with the proof not started.
- The preflight is read-only and uses the same function as the transition, so the two cannot disagree.
- [<Nms] spec: a missing declared file refuses with prove never called.
- After the in-progress transition deliver commits the tree change itself with a `chore(delendai): <tool> …` subject, so the proof sees a clean tree.
- Nothing but the tool's own write is committed; a foreign dirty file is left and the proof refuses it as before.
- [<Nms] spec covers a clean write, a foreign dirty file, and nothing written.
- A commit with the subject `chore(wip): keep the uncommitted work found at start` is accepted only when its review lines come with a `last-transition-id` the tool recorded (verified where transitions are recorded); any other hand edit still fails.
- The spec reproduces the shape of c8a5c88f0 (transition 0f533c39) both accepted and, with an unrecorded id, refused.
- A tool's write is never left uncommitted: it is committed by the tool (S3), which is the preferred path.
- `review approve` and `review release` without --session enter the agent's open review unit instead of a new one.
- No empty review unit is left behind by a command that finds one.
- e2e spec: two calls without --session use one unit.
- retiredRoots comes from the decisions module (a helper beside ownedNamespaces); carried-work derives nothing itself.
- lint:integration-decisions refuses code that builds retired roots or namespace-derived `refs/<namespace>/…` prefixes outside the module.
- [<Nms] spec: the lint flags the old carried-work shape and passes the new one.
- A worktree whose node_modules is present but missing a declared dependency is installed (the project's declared package manager, frozen lockfile), on enter and re-entry.
- The install command table is the one the proof's temporary worktree uses; no second list.
- [<Nms] spec: complete modules are left alone, incomplete ones installed, no lockfile skipped.
