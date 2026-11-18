---
id: f00796
title: "Any agent proves and hands over its work with the product's own commands, and a hand-over that is not proved is refused"
kind: feat
status: review
type: proposal
track: workflow
date: 2026-10-29
last-transition-id: 67c14cae-f3f4-41a3-9cce-a76f2df68fac
last-correlation-id: 67c14cae-f3f4-41a3-9cce-a76f2df68fac
last-transition-from: in-progress
last-transition-at: 2026-11-10T02:57:28.714Z
shipped-in:
  - "26aa84e29054cace69e611675dbf6a6c84789c3a"
  - "e51eaf2d8c7fd0bcea14ac06305ae5cbdbd0b836"
  - "f1476fe6c7fd146a8d9e471cf832a6c285c00302"
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
- **Status**: done
- **Files**: `tools/scripts/ci/near-specs.ts`, `tools/scripts/ci/near-specs.spec.ts`, `tools/scripts/ci/prove-plan.script.ts`, `tools/scripts/ci/prove-plan.script.spec.ts`, `package.json`
- **Gate**: type
- acceptance:
  - "`near-specs.ts` returns, for a diff against a base, each changed spec, the spec named after each changed source, the specs that import a changed file by path, and the specs the read map records reading one (near-specs.spec.ts), and `bun run prove` runs typecheck, biome-baseline, lint:architecture, lint:proposals, those specs with changed-file coverage and `test:sqlite` when state or proposals code changed, printing each step's time and exiting non-zero on any failure (prove-plan.script.spec.ts)."
- shipped-in: `b8f7509b6`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: mai-code-2
- review-log: requested_changes by gpt-5.3-codex — The shipped-in commit for S1 is 4bd7c10993ec, but it does not include the declared S1 evidence surface (`tools/scripts/ci/near-specs.ts`, `tools/scripts/ci/near-specs.spec.ts`, `tools/scripts/ci/prove-plan.script.spec.ts`). The acceptance for S1 explicitly depends on those artifacts. Repro: `git show --name-only 4bd7c10993ec` and compare with the S1 Files + acceptance section in f00796.
- review-log: approved by mai-code-2 — verified at 26aa84e29054, validate exit 0 and tests 59/59 claimed, no recorded run cited; acceptance 1/1: (1) near-specs.spec.ts covers changed specs, mirrors, direct importers, source-importer fallback and read-map readers; prove-plan.script.spec.ts covers nearest-spe… — Reviewed the delivered commit and the later proof-plan evolutions listed by the queue. The five named suites pass 59/59 and the current 80-workspace typecheck is green. Near-spec selection still covers changed specs, mirrors, path importers and read-map readers; later x01067 work narrows bun-owned execution but does not invalidate the delivered selector/proof foundation.

### S2 — This repository declares its proof
- **Status**: done
- **Files**: `package.json`, `tools/scripts/ci/prove-plan.script.ts`
- **Gate**: type
- acceptance:
  - "This repository's `prove` script is the fast proof (`prove-plan.script.ts --fast`) and `prove:plan` is the full plan, so the proof publishing runs is declared in the repository and nothing in a home directory is part of the flow."
- shipped-in: `4bd7c10993ec`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: mai-code-2
- review-log: approved by mai-code-2 — verified at e51eaf2d8c7f, validate exit 0 and tests 59/59 claimed, no recorded run cited; acceptance 1/1: (1) package.json declares prove as the local prove-plan runner with --fast and prove:plan as the full runner; candidateProofSteps reads package.json from the integ… — Reviewed the delivered repository scripts and current package.json. The five focused proof suites pass 59/59 and the all-workspaces typecheck passes; the fast `prove` and full `prove:plan` commands are declared in the repository rather than inferred from a home-directory script.

### S3 — Publishing a pull request runs the declared proof and refuses a red one
- **Status**: done
- **Files**: `packages/core/src/lib/work-units/work-unit-publish.service.ts`, `packages/core/src/lib/work-units/work-unit-proof.service.ts`, `packages/core/src/lib/contracts/interfaces/unit-proof.interface.ts`, `packages/core/src/lib/development-policy/declare-workflow.ts`, `packages/core/tests/src/lib/work-units/work-unit-publish-proof.spec.ts`, `packages/core/tests/src/lib/work-units/work-unit-proof.service.spec.ts`, `packages/core/tests/src/lib/work-units/work-unit-land.service.e2e.spec.ts`
- **Gate**: type
- acceptance:
  - "On the pull-request route with `requiresLocalCertification`, `work publish` runs the proof before pushing; so does the publication that `proposal_transition to=review` makes. The proof is read from the integration head: its `prove` script, else its declared gate. It runs in the unit's worktree on its committed tip, refused when the tree has uncommitted edits, or in a temporary worktree when the unit has none. Publishing refuses to push when a step fails and names the step, its output and the fix. A project that declares no proof publishes, with the declaration to add. The workflow sentence every agent receives says so (work-unit-publish-proof.spec.ts, work-unit-proof.service.spec.ts, work-unit-land.service.spec.ts)."
- shipped-in: `3bea2adee7ad`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: mai-code-2
- review-log: approved by mai-code-2 — verified at f1476fe6c7fd, validate exit 0 and tests 59/59 claimed, no recorded run cited; acceptance 1/1: (1) published() calls proveUnit before publishWorkUnitExclusively on PR routes; proveUnit reads candidateProofSteps from integrationSha and enforces a clean tip/wo… — Reviewed the delivered proof/publication path and the later extensions. The 59 focused proof, publish and real-git land specs pass plus full typecheck. Pull-request publication and proposal hand-over run the integration-declared proof at the unit tip and refuse before push with the failed step/output.

### S4 — A proved tree is not proved twice
- **Status**: done
- **Files**: `packages/core/src/lib/work-units/work-unit-proof.service.ts`, `packages/core/src/lib/work-units/work-unit-prove.service.ts`, `packages/core/src/lib/work-units/work-unit.service.ts`, `packages/cli/src/contracts/constants/work-command.constant.ts`, `packages/core/tests/src/lib/work-units/work-unit-proof.service.spec.ts`
- **Gate**: type
- acceptance:
  - "A green proof is recorded under the git directory, keyed by the tree it proved and the proof's commands. Proving or publishing the same tree with the same proof skips the run and says so (`remembered`); any change to either runs it again. `work prove` runs the proof alone, so a hand-over through a tool call finds it already proved, across the commits a product tool made on top of the proved tip that change only Markdown under the docs directory (a proposal's transition is one). Any other commit is proved again. The record is local and never sent to the forge (work-unit-proof.service.spec.ts, work-unit-publish-proof.spec.ts)."
- shipped-in: `3bea2adee7ad`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: mai-code-2
- review-log: approved by mai-code-2 — verified at f1476fe6c7fd, validate exit 0 and tests 59/59 claimed, no recorded run cited; acceptance 1/1: (1) proofKey hashes tree plus commands and records under git-common-dir/delendai-proofs; proveUnit detects the exact record and returns remembered. Specs assert re… — Reviewed proof reuse and the later compute-slot/revalidation changes. The 59 focused suites pass and full typecheck passes. Records are local, tree+command keyed, reused by publish, and only skipped across bounded proposal-document transition commits.

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

- `near-specs.ts` returns, for a diff against a base, each changed spec, the spec named after each changed source, the specs that import a changed file by path, and the specs the read map records reading one (near-specs.spec.ts), and `bun run prove` runs typecheck, biome-baseline, lint:architecture, lint:proposals, those specs with changed-file coverage and `test:sqlite` when state or proposals code changed, printing each step's time and exiting non-zero on any failure (prove-plan.script.spec.ts).
- This repository's `prove` script is the fast proof (`prove-plan.script.ts --fast`) and `prove:plan` is the full plan, so the proof publishing runs is declared in the repository and nothing in a home directory is part of the flow.
- On the pull-request route with `requiresLocalCertification`, `work publish` runs the proof before pushing; so does the publication that `proposal_transition to=review` makes. The proof is read from the integration head: its `prove` script, else its declared gate. It runs in the unit's worktree on its committed tip, refused when the tree has uncommitted edits, or in a temporary worktree when the unit has none. Publishing refuses to push when a step fails and names the step, its output and the fix. A project that declares no proof publishes, with the declaration to add. The workflow sentence every agent receives says so (work-unit-publish-proof.spec.ts, work-unit-proof.service.spec.ts, work-unit-land.service.spec.ts).
- A green proof is recorded under the git directory, keyed by the tree it proved and the proof's commands. Proving or publishing the same tree with the same proof skips the run and says so (`remembered`); any change to either runs it again. `work prove` runs the proof alone, so a hand-over through a tool call finds it already proved, across the commits a product tool made on top of the proved tip that change only Markdown under the docs directory (a proposal's transition is one). Any other commit is proved again. The record is local and never sent to the forge (work-unit-proof.service.spec.ts, work-unit-publish-proof.spec.ts).
- A unit proved in its own worktree reuses the dependencies installed there. A unit with no worktree is proved in a temporary one, installed first by the lockfile's package manager and removed afterwards. A project with no package manifest installs nothing. A failed install is a refusal that shows its output, never a pass. Stale derived files stay the pre-push drift check's to refuse (work-unit-proof.service.spec.ts).
