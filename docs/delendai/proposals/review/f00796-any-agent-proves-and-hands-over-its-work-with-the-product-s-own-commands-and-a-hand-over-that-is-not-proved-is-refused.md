---
id: f00796
title: "Any agent proves and hands over its work with the product's own commands, and a hand-over that is not proved is refused"
kind: feat
status: review
type: proposal
track: workflow
date: 2026-10-29
last-transition-id: 792e76ba-27b7-45d5-b1f1-2ecb129e02bf
last-correlation-id: 792e76ba-27b7-45d5-b1f1-2ecb129e02bf
last-transition-from: in-progress
last-transition-at: 2026-10-29T19:37:22.202Z
---

# f00796 — Any agent proves and hands over its work with the product's own commands, and a hand-over that is not proved is refused

## goal

Whatever its model or host, an agent proves its unit and hands it over with delendai's own commands, and the product refuses a hand-over that was not proved. The proof is fast because it runs what the change reaches, the same selection the forge will make. It costs nothing the second time because a proved tree is remembered. No private script in an orchestrator's home directory is needed for the flow to work.

## why

The workflow every agent is given says, for this profile: "Prove the candidate in isolation BEFORE you publish it; a candidate that was not proved must not be published." On the pull-request route nothing enforces that sentence. `work publish` and the auto-publish of `proposal_transition to=review` push whatever the unit holds; only the `merge` route runs the declared validation gate (`validation-gate-steps.service.ts`).

What made the flow work for one orchestrator lived outside the product, in `~/.cache/claude-orch`. `gates-fast.sh` runs typecheck, biome-baseline, lint:architecture, lint:proposals, the specs nearest the change (`near-specs.ts`), changed-file coverage and the sqlite suite when state changes. `batch.sh` merges develop, installs, regenerates derived files, gates and publishes only on a green exit code. Agents on other hosts have none of it. The owner's BYOK agents published red or empty units (x00990), and the rule stayed text.

Measured on 14 hand-overs on 2026-10-29: the fast proof took about 90 s (typecheck 19 s, lint:architecture 25 s, lint:proposals 10 s, biome-baseline 6 s, nearest specs 31 s). `vitest --changed` on a core change took 656 s on average, and the full local plan that `bun run prove` reproduces (v00143) takes the same order. One bad proof costs a full forge cycle of about 13 runner-minutes on a small pull request and 51 on a full one, plus a repair push.

## non-goals

- Replacing the forge's checks. The local proof is a pre-flight; the forge stays the authority, and nothing the agent records lets a pull request skip a check (owner, 2026-10-28: never skip CI on an agent's word).
- A new setting. The proof is the project's `prove` script, the same convention as its `validate` script. A project without one is proved by the gate it already declares (`validationMatrix.scopes`, else `validate`). `validationMatrix` itself stays the certification gate that `delendai validate` and the slice close run, so declaring the fast proof there would have weakened them.

## slices

- global_gate: type

### S1 — The nearest specs are the product's
- **Status**: review
- **Files**: `tools/scripts/ci/near-specs.ts`, `tools/scripts/ci/near-specs.spec.ts`, `tools/scripts/ci/prove-plan.script.ts`, `tools/scripts/ci/prove-plan.script.spec.ts`, `package.json`
- **Gate**: type
- acceptance:
  - "`near-specs.ts` returns, for a diff against a base, each changed spec, the spec named after each changed source and the specs that import a changed file by path (near-specs.spec.ts), and `bun run prove` runs typecheck, biome-baseline, lint:architecture, lint:proposals, those specs with changed-file coverage and `test:sqlite` when state or proposals code changed, printing each step's time and exiting non-zero on any failure (prove-plan.script.spec.ts)."
- shipped-in: `4bd7c10993ec`
- review-state: in_review
- review-implementer: claude-opus-5-5

### S2 — This repository declares its proof
- **Status**: review
- **Files**: `package.json`, `tools/scripts/ci/prove-plan.script.ts`
- **Gate**: type
- acceptance:
  - "This repository's `prove` script is the fast proof (`prove-plan.script.ts --fast`) and `prove:plan` is the full plan, so the proof publishing runs is declared in the repository and nothing in a home directory is part of the flow."
- shipped-in: `4bd7c10993ec`
- review-state: in_review
- review-implementer: claude-opus-5-5

### S3 — Publishing a pull request runs the declared proof and refuses a red one
- **Status**: review
- **Files**: `packages/core/src/lib/work-units/work-unit-publish.service.ts`, `packages/core/src/lib/work-units/work-unit-proof.service.ts`, `packages/core/src/lib/contracts/interfaces/unit-proof.interface.ts`, `packages/core/src/lib/development-policy/declare-workflow.ts`, `packages/core/tests/src/lib/work-units/work-unit-publish-proof.spec.ts`, `packages/core/tests/src/lib/work-units/work-unit-proof.service.spec.ts`, `packages/core/tests/src/lib/work-units/work-unit-land.service.spec.ts`
- **Gate**: type
- acceptance:
  - "On the pull-request route with `requiresLocalCertification`, `work publish` runs the proof before pushing; so does the publication that `proposal_transition to=review` makes. The proof is read from the integration head: its `prove` script, else its declared gate. It runs in the unit's worktree on its committed tip, refused when the tree has uncommitted edits, or in a temporary worktree when the unit has none. Publishing refuses to push when a step fails and names the step, its output and the fix. A project that declares no proof publishes, with the declaration to add. The workflow sentence every agent receives says so (work-unit-publish-proof.spec.ts, work-unit-proof.service.spec.ts, work-unit-land.service.spec.ts)."
- shipped-in: `3bea2adee7ad`
- review-state: in_review
- review-implementer: claude-opus-5-5

### S4 — A proved tree is not proved twice
- **Status**: review
- **Files**: `packages/core/src/lib/work-units/work-unit-proof.service.ts`, `packages/core/src/lib/work-units/work-unit-prove.service.ts`, `packages/core/src/lib/work-units/work-unit.service.ts`, `packages/cli/src/contracts/constants/work-command.constant.ts`, `packages/core/tests/src/lib/work-units/work-unit-proof.service.spec.ts`
- **Gate**: type
- acceptance:
  - "A green proof is recorded under the git directory, keyed by the tree it proved and the proof's commands. Proving or publishing the same tree with the same proof skips the run and says so (`remembered`); any change to either runs it again. `work prove` runs the proof alone, so a hand-over through a tool call finds it already proved, across the commits a product tool made on top of the proved tip that change only Markdown under the docs directory (a proposal's transition is one). Any other commit is proved again. The record is local and never sent to the forge (work-unit-proof.service.spec.ts, work-unit-publish-proof.spec.ts)."
- shipped-in: `3bea2adee7ad`
- review-state: in_review
- review-implementer: claude-opus-5-5

### S5 — A proof installs only what it lacks
- **Status**: review
- **Files**: `packages/core/src/lib/work-units/work-unit-proof.service.ts`, `packages/core/tests/src/lib/work-units/work-unit-proof.service.spec.ts`
- **Gate**: type
- acceptance:
  - "A unit proved in its own worktree reuses the dependencies installed there. A unit with no worktree is proved in a temporary one, installed first by the lockfile's package manager and removed afterwards. A project with no package manifest installs nothing. A failed install is a refusal that shows its output, never a pass. Stale derived files stay the pre-push drift check's to refuse (work-unit-proof.service.spec.ts)."
- shipped-in: `3bea2adee7ad`
- review-state: in_review
- review-implementer: claude-opus-5-5

## acceptance

- `near-specs.ts` returns, for a diff against a base, each changed spec, the spec named after each changed source and the specs that import a changed file by path (near-specs.spec.ts), and `bun run prove` runs typecheck, biome-baseline, lint:architecture, lint:proposals, those specs with changed-file coverage and `test:sqlite` when state or proposals code changed, printing each step's time and exiting non-zero on any failure (prove-plan.script.spec.ts).
- This repository's `prove` script is the fast proof (`prove-plan.script.ts --fast`) and `prove:plan` is the full plan, so the proof publishing runs is declared in the repository and nothing in a home directory is part of the flow.
- On the pull-request route with `requiresLocalCertification`, `work publish` runs the proof before pushing; so does the publication that `proposal_transition to=review` makes. The proof is read from the integration head: its `prove` script, else its declared gate. It runs in the unit's worktree on its committed tip, refused when the tree has uncommitted edits, or in a temporary worktree when the unit has none. Publishing refuses to push when a step fails and names the step, its output and the fix. A project that declares no proof publishes, with the declaration to add. The workflow sentence every agent receives says so (work-unit-publish-proof.spec.ts, work-unit-proof.service.spec.ts, work-unit-land.service.spec.ts).
- A green proof is recorded under the git directory, keyed by the tree it proved and the proof's commands. Proving or publishing the same tree with the same proof skips the run and says so (`remembered`); any change to either runs it again. `work prove` runs the proof alone, so a hand-over through a tool call finds it already proved, across the commits a product tool made on top of the proved tip that change only Markdown under the docs directory (a proposal's transition is one). Any other commit is proved again. The record is local and never sent to the forge (work-unit-proof.service.spec.ts, work-unit-publish-proof.spec.ts).
- A unit proved in its own worktree reuses the dependencies installed there. A unit with no worktree is proved in a temporary one, installed first by the lockfile's package manager and removed afterwards. A project with no package manifest installs nothing. A failed install is a refusal that shows its output, never a pass. Stale derived files stay the pre-push drift check's to refuse (work-unit-proof.service.spec.ts).
