---
id: f00796
title: "Any agent proves and hands over its work with the product's own commands, and a hand-over that is not proved is refused"
kind: feat
status: ready
type: proposal
track: workflow
date: 2026-10-29
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
- A new setting. The gate is `validationMatrix.scopes`, which the `merge` route already reads, with the project's `validate` script as the fallback.

## slices

- global_gate: type

### S1 — The nearest specs are the product's
- **Status**: pending
- **Files**: `tools/scripts/ci/near-specs.ts`, `tools/scripts/ci/near-specs.spec.ts`, `tools/scripts/ci/prove-plan.script.ts`, `tools/scripts/ci/prove-plan.script.spec.ts`, `package.json`
- **Gate**: type
- acceptance:
  - "`near-specs.ts` returns, for a diff against a base, each changed spec, the spec named after each changed source and the specs that import a changed file by path (near-specs.spec.ts), and `bun run prove -- --fast` runs typecheck, biome-baseline, lint:architecture, lint:proposals, those specs with changed-file coverage and `test:sqlite` when state or proposals code changed, printing each step's time and exiting non-zero on any failure (prove-plan.script.spec.ts)."

### S2 — This repository declares its proof
- **Status**: pending
- **Files**: `delendai.config.json`
- **Gate**: type
- acceptance:
  - "`validationMatrix.scopes` in delendai.config.json declares `bun run prove -- --fast` as the proof, so the gate `validation-gate-steps.service.ts` reads names it and nothing in a home directory is part of the flow."

### S3 — Publishing a pull request runs the declared proof and refuses a red one
- **Status**: pending
- **Files**: `packages/core/src/lib/work-units/work-unit-publish.service.ts`, `packages/core/src/lib/work-units/validation-gate-steps.service.ts`, `packages/core/tests/src/lib/work-units/work-unit-publish-proof.spec.ts`
- **Gate**: type
- acceptance:
  - "On the pull-request route with `requiresLocalCertification`, `work publish` (and the publication `proposal_transition to=review` makes) runs the declared gate in the unit's worktree on the merge of the unit with the integration branch, refuses to push when a step fails and names the step and its fix; a project that declares no gate is refused with the declaration to add (work-unit-publish-proof.spec.ts)."

### S4 — A proved tree is not proved twice
- **Status**: pending
- **Files**: `packages/core/src/lib/work-units/work-unit-proof-record.service.ts`, `packages/core/tests/src/lib/work-units/work-unit-proof-record.service.spec.ts`, `packages/core/src/lib/work-units/work-unit-publish.service.ts`
- **Gate**: type
- acceptance:
  - "A green proof is recorded under the cache directory by the tree it proved and the gate's definition; publishing the same tree with the same gate skips the run and says so, and any change to either runs it again. The record is local and never sent to the forge (work-unit-proof-record.service.spec.ts)."

### S5 — Preparing a unit does only what changed
- **Status**: pending
- **Files**: `packages/core/src/lib/work-units/work-unit-publish.service.ts`, `packages/core/tests/src/lib/work-units/work-unit-publish-proof.spec.ts`
- **Gate**: type
- acceptance:
  - "Before the proof, publishing installs dependencies only when the lockfile differs from the one last installed in the worktree, and regenerates derived files only when a source they derive from changed, so a unit whose merge brings neither pays for neither (work-unit-publish-proof.spec.ts)."

## acceptance

- `near-specs.ts` returns, for a diff against a base, each changed spec, the spec named after each changed source and the specs that import a changed file by path (near-specs.spec.ts), and `bun run prove -- --fast` runs typecheck, biome-baseline, lint:architecture, lint:proposals, those specs with changed-file coverage and `test:sqlite` when state or proposals code changed, printing each step's time and exiting non-zero on any failure (prove-plan.script.spec.ts).
- `validationMatrix.scopes` in delendai.config.json declares `bun run prove -- --fast` as the proof, so the gate `validation-gate-steps.service.ts` reads names it and nothing in a home directory is part of the flow.
- On the pull-request route with `requiresLocalCertification`, `work publish` (and the publication `proposal_transition to=review` makes) runs the declared gate in the unit's worktree on the merge of the unit with the integration branch, refuses to push when a step fails and names the step and its fix; a project that declares no gate is refused with the declaration to add (work-unit-publish-proof.spec.ts).
- A green proof is recorded under the cache directory by the tree it proved and the gate's definition; publishing the same tree with the same gate skips the run and says so, and any change to either runs it again. The record is local and never sent to the forge (work-unit-proof-record.service.spec.ts).
- Before the proof, publishing installs dependencies only when the lockfile differs from the one last installed in the worktree, and regenerates derived files only when a source they derive from changed, so a unit whose merge brings neither pays for neither (work-unit-publish-proof.spec.ts).
