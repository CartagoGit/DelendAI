---
id: x01124
title: "A delivery that fails or is refused exits non-zero, and slices of one proposal published as one pull request join its open publication instead of failing non-fast-forward"
kind: fix
status: ready
type: proposal
track: general
date: 2026-11-21
---

# x01124 — A delivery that fails or is refused exits non-zero, and slices of one proposal published as one pull request join its open publication instead of failing non-fast-forward

## goal

Two defects found on 2026-11-21 are fixed: `work deliver` reports its verdict in its exit code whatever the way it failed, and a slice whose publication target is the proposal's shared publication ref merges that ref's open commits into the unit before pushing, so concurrent slices of one small proposal no longer end in rc=4 with the work unpublished.

## why

(A) Two deliveries reported rc=0 after 'NOT PROVED, failed: typecheck ... Fix what failed' (a357 on x01123 S2) and 'refused before the compute slot ... nothing was proved' (x01104). Every layer read returns a non-zero code on those paths: runDelivery in packages/cli/src/lib/work-deliver.service.ts (refusal from precheckDelivery and a prove with code != 0 are returned as is), refused() in packages/core/src/lib/work-units/work-unit-shared.service.ts (EXIT_CODE.VALIDATION), proved() in packages/core/src/lib/work-units/work-unit-prove.service.ts, sizedAnswer in packages/cli/src/lib/work-answer-size.service.ts and runEntry in packages/cli/src/index.ts (process.exitCode = result code). A local refusal probe returned rc=4, so the rc=0 is not reproduced from source reading: the cause is either the base-failure subtraction in proved() (subtractBaseFailures returns passed=true and code OK when the failing specs are in develop's known-failing set), or a layer around the process (a wrapper or a pipe). No spec runs the CLI as a process and checks its exit code, which is why nobody knows. (B) packages/core/src/lib/work-units/publication-target.service.ts (choosePublicationTarget) names pr/<kind>/<agent>/<id>-all/<topic> for every slice of a proposal the policy publishes whole (publicationUnitFor in packages/core/src/lib/development-policy/publication-unit.ts, granularity adaptive: small proposals are one pull request), while each slice has its own unit and work ref (wip/.../<id>-S1, <id>-S2). Slice S3 published first and owns the ref (#3407); S2's push was not a fast-forward, work-unit-publish.service.ts answered with a nextAction asking the AGENT to merge the publication into its unit, and deliver ended rc=4 with the work ref kept. Per-slice publication was weighed and rejected: it would split a pull request the project's policy chose to be one (granularity is already the knob: granularity=slice gives one pull request per slice), and strand the one already open. The work model's own rule 7 says the unit merges the publication before republishing; that merge is deterministic and belongs to the product, not the agent. Checked docs/delendai/proposals: x01076 (republish on deliver), x01093 (deliver names the PR) and x01111 are adjacent; none covers either defect.

## non-goals

- Changing the publication granularity policy or the work-ref template
- Resolving merge conflicts automatically: a conflicting join is refused with the files named

## slices

- global_gate: none

### S1 — A failed or refused delivery exits non-zero, proved by running the CLI as a process
- **Status**: pending
- **Files**: `packages/cli/src/lib/work-deliver.service.spec.ts`, `new:packages/cli/src/lib/work-deliver-exit-code.e2e.spec.ts`, `packages/core/src/lib/work-units/work-unit-prove.service.ts`, `packages/core/tests/src/lib/work-units/work-unit-prove.service.spec.ts`
- **Gate**: type
- **Decisions**: none
- acceptance:
  - "work-deliver.service.spec.ts: deliverUnit returns a non-zero code when ports.prove returns code VALIDATION and when precheckDelivery refuses, and never a data.delivered."
  - "work-deliver-exit-code.e2e.spec.ts: `bun packages/cli/src/index.ts work deliver` run as a child process in a temp git repo whose prove script fails exits with a code other than 0 and prints no 'delivered'; the same run refused for its arguments exits 4 (a pre-check refusal needs the proposals plugin, which a temp repo lacks), and `work prove` there fails non-zero, and passes with baseFailures only for a failure develop's note names."
  - "work-deliver-exit-code.e2e.spec.ts: a failing proof whose failing specs are in the known-failing set and untouched by the unit is the only proof failure reported as passed (a compiler error printing such a spec path is not), and `work prove --json` names baseFailures."
  - "nice -n 19 bunx vitest run packages/cli/src/lib/work-deliver.service.spec.ts passes."

### S2 — Publishing a slice into the proposal's open publication merges it into the unit first
- **Status**: pending
- **Files**: `packages/core/src/lib/work-units/work-unit-publish.service.ts`, `new:packages/core/src/lib/work-units/publication-join.service.ts`, `new:packages/core/tests/src/lib/work-units/publication-join.service.e2e.spec.ts`, `packages/core/tests/src/lib/work-units/work-unit-publish.service.spec.ts`
- **Gate**: type
- **Decisions**: none
- acceptance:
  - "publication-join.service.e2e.spec.ts: two units of one proposal with a whole-proposal publication target; the first publishes, the second publishes after it with no agent-side merge, and the publication ref holds both units' commits."
  - "publication-join.service.e2e.spec.ts: when the second unit conflicts with the publication, publish is refused with VALIDATION naming the conflicting files and the unit is left unchanged."
  - "work-unit-publish.service.spec.ts: for a slice joining the proposal's publication, the publish result carries no nextAction asking the agent to merge the publication into the unit."
  - "nice -n 19 bunx vitest run packages/core/tests/src/lib/work-units/publication-join.service.e2e.spec.ts passes."

## acceptance

- work-deliver.service.spec.ts: deliverUnit returns a non-zero code when ports.prove returns code VALIDATION and when precheckDelivery refuses, and never a data.delivered.
- work-deliver-exit-code.e2e.spec.ts: `bun packages/cli/src/index.ts work deliver` run as a child process in a temp git repo whose prove script fails exits with a code other than 0 and prints no 'delivered'; the same run refused for its arguments exits 4 (a pre-check refusal needs the proposals plugin, which a temp repo lacks), and `work prove` there fails non-zero, and passes with baseFailures only for a failure develop's note names.
- work-deliver-exit-code.e2e.spec.ts: a failing proof whose failing specs are in the known-failing set and untouched by the unit is the only proof failure reported as passed (a compiler error printing such a spec path is not), and `work prove --json` names baseFailures.
- nice -n 19 bunx vitest run packages/cli/src/lib/work-deliver.service.spec.ts passes.
- publication-join.service.e2e.spec.ts: two units of one proposal with a whole-proposal publication target; the first publishes, the second publishes after it with no agent-side merge, and the publication ref holds both units' commits.
- publication-join.service.e2e.spec.ts: when the second unit conflicts with the publication, publish is refused with VALIDATION naming the conflicting files and the unit is left unchanged.
- work-unit-publish.service.spec.ts: for a slice joining the proposal's publication, the publish result carries no nextAction asking the agent to merge the publication into the unit.
- nice -n 19 bunx vitest run packages/core/tests/src/lib/work-units/publication-join.service.e2e.spec.ts passes.
