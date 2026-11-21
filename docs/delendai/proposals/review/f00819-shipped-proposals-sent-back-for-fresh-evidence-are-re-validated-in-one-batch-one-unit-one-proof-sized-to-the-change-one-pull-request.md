---
id: f00819
title: "Shipped proposals sent back for fresh evidence are re-validated in one batch: one unit, one proof sized to the change, one pull request"
kind: feat
status: review
type: proposal
track: architecture
date: 2026-11-17
last-transition-id: f5e80b6b-42f4-455d-93e5-2286849cdaf8
last-correlation-id: f5e80b6b-42f4-455d-93e5-2286849cdaf8
last-transition-from: in-progress
last-transition-at: 2026-11-18T08:23:19.409Z
shipped-in:
  - "569fa373862fb1fa57d6c4671fe8150cecb414f3"
  - "6c623053b93278e334d2b3fe477ad5024878bb9f"
---

# f00819 — Shipped proposals sent back for fresh evidence are re-validated in one batch: one unit, one proof sized to the change, one pull request

## goal

`delendai work revalidate [--proposals=<id,id>] --agent=<id>` re-validates every ready proposal whose live slices all carry `shipped-in` and whose review-state is changes_requested, in ONE work unit, with ONE proof sized to a documents-only change and ONE pull request. Without --proposals it selects exactly that set and prints the list it chose. It applies each proposal's ready to in-progress to review transitions through the existing transition service (never hand-edited status lines), recording for every slice the develop sha it was re-validated at. A proposal the service refuses or that fails is reported by id and left out; the rest still go. Nothing loops or retries. Out of scope: the reviewers' approvals of the batch (a later review batch) and the 37 partially shipped ready proposals.

## why

Verified 2026-11-17 on develop 1b14a5075: 61 proposals in docs/delendai/proposals/ready/ have every live slice carrying `shipped-in` with review-state changes_requested. Their review-log lines are a bulk 'Stale review round; rebase on current develop and re-validate this slice with fresh evidence' (by gpt-5.3-codex) or 'shipped-in <sha> is stale'. Re-validating one today is `work enter --kind=implement` (a worktree and a dependency install), then `work deliver` (the full proof), then one pull request. The orchestrator's re-delivery loop (~/.cache/claude-orch/redeliver/run.log, 2026-11-17 07:33-07:54) measured 3 min 18 s, 3 min 21 s, 3 min 23 s, 3 min 28 s, 3 min 29 s and 3 min 32 s per proposal (x00993 to x01005), each with its own CI run, so 61 take about 3.5 hours of proof plus 61 pull requests, for a change that only edits proposal documents. Where those minutes go is NOT yet measured per step: the loop times enter plus deliver together. prove-plan.script.ts already has a documents-only proof (isProposalOnly, line 414; PROPOSAL_CHECKS line 417; PROPOSAL_GENERATORS line 425), measured 2026-11-03 as 651 s for ten checks of which the proposal gates and generators took under a minute, so the largest suspected part is the per-proposal unit (enter, install, worktree, publish, queue) rather than the proof; S3 measures it first and targets the largest part measured. Measured 2026-11-18 on develop (S3): `work enter` 18 s (it links the shared dependencies, no install); the proposal-only proof is the three static checks run together, lint-docs 63 s, lint-security 45 s, lint-governance 29 s (63 s wall), plus the four generators, 7.2 s, 0.3 s, 0.8 s and 0.3 s (8.7 s); the full code proof of the same unit measures 344 s to 373 s. So one proposal costs about 18 s of entry and about 72 s of proof, and the largest part that repeats per proposal is that 63 s static-check run, which a batch pays once; the publish and the forge's run are not measured per step here. Admitted generated paths: none (the transitions' commits changed only `in-progress/` and `review/` documents), so isProposalOnly stays the proposal folder alone. Unit identity (decision, S2): the only identity the existing grammar and guards already accept for a multi-proposal documents-only unit is the review batch, `review/batch-all-g<n>/<topic>`. Evidence: profiles.constant.ts:65-91 (WORK_KINDS, DOCUMENT_ONLY_KINDS review and reconcile, REVIEW_BATCH_ID 'batch'); git-guard-review-scope.ts:36-96 confines a review-kind unit to docs and `.generated.` files, exactly the scope of this change; declared-slice.service.ts:49 exempts slice 'batch'/'all' from the declared-slice check; publication-target.service.ts:233 publishes a batch whole as one pull request; work-unit-generation.service.ts:197-211 lets the batch be entered without the one-session-per-slice refusal; rebuild-work-units.ts:56 records it as batch-<agent>, so two agents never collide. review-kind.service.ts:54-62 REFUSES any other kind on the batch, so kind review is the only kind it takes; the cost is that the review machinery reads such a unit as verdicts. The guards that must be taught that a revalidation batch is not a reviewer's pack: work-unit-publish.service.ts:118 and :218, review-unit-publish-checks.service.ts (isReviewUnitBranch use), review-claim.service.ts:72, review-unit-tree.service.ts:83, unit-forge-sync.service.ts:242, unit-topic.service.ts:36 (review topic fixed to the review pack topic), diverged-review-pack.service.ts:41. A new kind (a 'revalidate' entry in WORK_KINDS and DOCUMENT_ONLY_KINDS) is the alternative; it needs the same guards plus review-kind.service.ts:54 and the work-ref grammar, and is rejected here as wider. S2 verifies each listed guard with a spec before relying on it. Not decided here: whether the transitions' generated outputs (agent catalog, docs index) keep the batch's changed set inside isProposalOnly; S3 decides it from the measured changed set.

## non-goals

- The reviewers' approvals of the batch: a later review batch.
- The 37 partially shipped ready proposals.
- Changing the proof of any unit that touches a file outside docs/delendai/proposals/.

## slices

- global_gate: none

### S1 — `delendai work revalidate` selects the proposals and prints the list it chose
- **Status**: done
- **Files**: `packages/cli/src/commands/work.command.ts`, `packages/cli/src/commands/work.command.spec.ts`
- **Gate**: none
- acceptance:
  - "Decision: the command is a subcommand of `work` in TypeScript, parsed in work.command.ts beside `deliver`, with its logic in a new service file packages/cli/src/lib/work-revalidate.service.ts and a mirror-named spec; it reuses scalarArg and the agent resolution `deliver` uses and adds no second argument parser"
  - "Decision: without --proposals the selection is every ready proposal whose every live slice (not retired, not dropped) has a shipped-in value and whose review-state is changes_requested; the selection is a pure function over the parsed proposals, and --proposals=<id,id> replaces it with exactly those ids, each still checked against the same predicate"
  - "Without --proposals the command prints the chosen ids, one per line, before it changes anything, and a project with none prints that it chose none and exits 0 [<50ms]"
  - "A spec with a fixture of one proposal per case selects only the proposal with every live slice shipped-in and changes_requested, and leaves out one with an unshipped live slice, one with a different review-state, and one not in ready/ [<50ms]"
  - "A proposal named in --proposals that does not satisfy the predicate is reported by id with the reason and left out, and the other ids are still selected [<50ms]"
  - "Pre-check: `delendai work prove --only=typecheck,lint-governance` passes before the slice is handed over"
- shipped-in: `a206adf9d929`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: mimo-v2.6-flash
- review-log: approved by mimo-v2.6-flash — verified at 569fa373862f, validate exit 0 and tests 57/57 claimed, no recorded run cited; acceptance 6/6: (1) work.command.ts line 378 `if (args[0] === 'revalidate')` sits beside `deliver` (line 395) and only calls scalarArg(flags,'agent') / scalarArg(flags,'proposals'… (2) selectRevalidation is a pure function over the parsed proposals: it keeps stage === 'ready' whose every isLive slice has shippedIn and reviewState === 'changes… (3) revalidateBatch prints the refusal lines, then `for (const id of selection.chosen) ports.print(id)` and only afterwards enters the unit and transitions; an emp… (4) FIXTURE in work-revalidate.service.spec.ts has one proposal per case: f1 (all live slices shipped + changes_requested) and f5 (the unshipped slice is retired) … (5) the named-id spec calls selectRevalidation(FIXTURE, ['f1','f2','f4','zz']) and expects result.chosen === ['f1'], result.refused ids ['f2','f4','zz'] each with … (6) `bun run typecheck` exits 0 across all 80 workspaces; `work prove --only=...` runs lint-docs (ok, 29s) and lint-security (ok, 6s); lint-governance reports `31/… — Approved at 569fa373862fb, the newest first-parent delivery of f00819 that touches work.command.ts/.spec.ts and an ancestor of develop (it supersedes shipped-in a206adf9d929). Gate: `bun run typecheck` exits 0 across all 80 workspaces. Tests: 57/57 in work-revalidate.service.spec.ts and work.command.spec.ts. Pre-check `work prove --only=typecheck,lint-governance`: lint-docs ok (29s), lint-security ok (6s), lint-governance 31/32 jobs — the one failing job is closed-with-independent-approval, a false positive that mis-parses this review unit's own work ref (kindOfRef/agentOfRef still read the legacy agent-first shape while f00808 S8 made work refs kind-first), unrelated to this slice and filed separately. S2 and S3 are judged on their own and do not ride on this verdict.

### S2 — The batch is one unit and applies each proposal's transitions through the transition service
- **Status**: pending
- **DependsOn**: [S1]
- **Files**: `packages/core/src/lib/work-units/review-kind.service.ts`, `packages/core/src/lib/work-units/work-unit-publish.service.ts`, `packages/core/src/lib/work-units/review-unit-publish-checks.service.ts`, `packages/core/src/lib/work-units/unit-topic.service.ts`, `packages/core/src/lib/work-units/unit-forge-sync.service.ts`, `plugins/proposals/src/lib/services/review-claim.service.ts`, `plugins/proposals/src/lib/services/review-unit-tree.service.ts`, `plugins/proposals/src/lib/tools/transition/run-transition.tool.ts`
- **Gate**: none
- acceptance:
  - "Decision: the unit identity is the review batch, `review/batch-all-g<n>/<topic>`, entered with work enter --kind=review --proposal=batch --slice=all; the reason and the files proving the grammar and guards accept it are in this proposal's why (profiles.constant.ts:65-91, git-guard-review-scope.ts:36-96, declared-slice.service.ts:49, publication-target.service.ts:233, work-unit-generation.service.ts:197-211, rebuild-work-units.ts:56, review-kind.service.ts:54-62); no new kind is added"
  - "Decision: each guard listed in the why that reads a review batch as a reviewer's verdict pack (work-unit-publish.service.ts:118 and :218, review-unit-publish-checks.service.ts, review-claim.service.ts:72, review-unit-tree.service.ts:83, unit-forge-sync.service.ts:242, unit-topic.service.ts:36) gets a spec that enters a revalidation batch and shows it is not refused and not mistaken for a review pack; a guard that already accepts it needs only the spec"
  - "Decision: each proposal's ready to in-progress to review transitions are applied by calling the existing transition service inside the unit's worktree, one proposal at a time, from the new work-revalidate.service.ts; the command never writes a status line, and for every slice of a proposal it records the develop sha the batch is validated at in that slice's evidence through the service's own field"
  - "The command enters one unit for the whole batch, never one per proposal: a spec counts the unit entries for a selection of three proposals and expects one [<100ms]"
  - "A proposal whose transition is refused or fails is reported by id with the service's reason, is absent from the batch's diff, and the remaining proposals are still transitioned; a spec with one refusing fake among three expects two transitioned and one reported [<100ms]"
  - "Nothing retries or loops: a spec with a failing fake shows the service is called once for that proposal [<100ms]"
  - "Pre-check: `delendai work prove --only=typecheck,lint-governance,lint-architecture` passes before the slice is handed over"
- shipped-in: `569fa373862f`
- review-state: changes_requested
- review-implementer: claude-opus-5-5
- review-reviewer: mimo-v2.6-flash
- review-log: requested_changes by mimo-v2.6-flash — S2 is sent back: the acceptance requires a spec for EACH guard listed in the `why`, and three of the six have none that exercises a revalidation batch. (1) work-unit-publish.service.ts:118 and :218 — work-unit-publish.service.spec.ts and its e2e contain zero `revalid`/`batch` cases (grep count 0 in both). (2) review-unit-tree.service.ts:83 — no spec anywhere references proposalsDirOfUnit or reviewUnitOfAgent. (3) unit-forge-sync.service.ts:242 — unit-forge-sync.service.spec.ts has zero revalid/batch cases. Already covered: review-unit-publish-checks.service.spec.ts (`does not refuse a revalidation batch that changes proposal documents, nor mistake it for another reviewer pack`), review-claim.service.spec.ts (`does not read a revalidation batch as a review pack`), unit-topic.service.spec.ts (isRevalidationIdentity / isRevalidationBranch). The `why` also names diverged-review-pack.service.ts:41, which the acceptance list omits — give it the same spec.

S3 has an unmet criterion too; it is recorded here because one change request reopens the whole proposal and no second one can be recorded until it is resubmitted. S3's line "The measured wall time of one batch of N proposals is recorded in the proposal and is lower than N times the 3 min 18 s to 3 min 32 s" is not met: the `why` records only per-proposal numbers (`work enter` 18 s, proposal-only proof 63 s static + 8.7 s generators, full code proof 344-373 s) and says verbatim "the publish and the forge's run are not measured per step here". No wall time of one batch of N proposals appears anywhere in the document, so neither half of that line can be checked. S3's Decision line asks for a step-by-step timing that includes publish and pull request open — those are exactly the two steps the `why` says were not measured.

S1 and S4 are approved on their own evidence; the objections are S2's missing guard specs and S3's missing batch measurement.

### S3 — The batch is proved by the documents-only proof, after measuring where the 3.5 minutes go
- **Status**: review
- **DependsOn**: [S2]
- **Files**: `tools/scripts/ci/prove-plan.script.ts`, `tools/scripts/ci/prove-plan.script.spec.ts`
- **Gate**: none
- acceptance:
  - "Decision: before any change, one real re-delivery of a shipped-in proposal is timed step by step (work enter, dependency install, each prove step the plan prints, publish, pull request open) and the numbers are written into this proposal's why; the first piece of work is that measurement, and the acceptance below targets the largest measured part"
  - "Decision: a unit whose diff touches only files under docs/delendai/proposals/ runs only the governance gates already named in prove-plan.script.ts: the static checks lint-governance, lint-docs and lint-security (PROPOSAL_CHECKS, line 417) and the generators agent-catalog current, docs-index current, host-hints current and roadmap drift (PROPOSAL_GENERATORS, line 425); it needs no dependency install beyond what those gates import"
  - "The batch unit's proof is the isProposalOnly plan: a spec with a changed set of proposal files only expects earlySteps to equal PROPOSAL_GENERATORS and the static families to equal PROPOSAL_CHECKS, and a changed set with one code file expects the full plan [<50ms]"
  - "If a transition writes generated files outside docs/delendai/proposals/ so that the batch no longer satisfies isProposalOnly, a spec states which generated paths are admitted and isProposalOnly admits exactly those and no code path [<50ms]"
  - "A spec shows the batch run does not run the dependency install when the diff is proposal-only [<100ms]"
  - "The measured wall time of one batch of N proposals is recorded in the proposal and is lower than N times the 3 min 18 s to 3 min 32 s measured per proposal today"
  - "Pre-check: `delendai work prove --only=typecheck,lint-governance,lint-docs,lint-security` passes before the slice is handed over"
- shipped-in: `746feeb8c3d5`
- review-state: in_review
- review-implementer: claude-opus-5-5

### S4 — The batch is published as one pull request titled by the product, and documented
- **Status**: done
- **DependsOn**: [S3]
- **Files**: `packages/cli/src/contracts/constants/help-translation.constant.ts`, `plugins/proposals/skills/delendai-work-unit-playbook/SKILL.md`
- **Gate**: none
- acceptance:
  - "Decision: the command publishes the unit with the existing publish path so the product titles the pull request; it passes no title of its own, and one pull request is opened for the whole batch (publication-target.service.ts:233 publishes a batch whole)"
  - "A spec with a fake publish port in work-revalidate.service.spec.ts expects exactly one publish call for a batch of three proposals and no title argument [<100ms]"
  - "The CLI help summary for `work` names `revalidate` in every declared help locale, so `bun run lint:cli:i18n` passes"
  - "The work-unit playbook has one line saying that shipped proposals sent back for fresh evidence are re-validated with `delendai work revalidate`, not one unit each, and that approving the batch is a later review batch"
  - "Pre-check: `delendai work prove --only=typecheck,lint-docs,lint-governance` passes before the slice is handed over"
- shipped-in: `6c623053b932`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: mimo-v2.6-flash
- review-log: approved by mimo-v2.6-flash — verified at 6c623053b932, validate exit 0 and tests 57/57 claimed, no recorded run cited; acceptance 5/5: (1) revalidateBatch ends with a single `const published = await ports.publish();` and returns its code — no title argument is built anywhere; revalidatePortsOf wir… (2) spec `publishes once for a batch of three proposals, with no title argument` calls revalidateBatch and expects `calls.publish` to equal `[[]]` — exactly one ca… (3) help-translation.constant.ts line 224 gives `work` a summary that names `revalidate` ("`revalidate` re-validates the shipped proposals sent back for fresh evid… (4) delendai-work-unit-playbook/SKILL.md line 68 reads verbatim: "Shipped proposals sent back for fresh evidence are re-validated with `delendai work revalidate`, … (5) `bun run typecheck` exits 0 across all 80 workspaces; `work prove --only=...` runs lint-docs (ok, 29s); lint-governance reports 31/32 jobs passing, the single … — Approved at 6c623053b9327, the merge that delivered S4 and an ancestor of develop (no later f00819 delivery touches its two files). Gate: `bun run typecheck` exits 0; `bun run lint:cli:i18n` exits 0; the `work` help summary names `revalidate`; the playbook line is at SKILL.md:68. Tests 57/57 in work-revalidate.service.spec.ts (which holds the publish-once spec) and work.command.spec.ts. lint-governance is 31/32 here too, the single failure being the same unrelated closed-with-independent-approval false positive filed separately. S2 and S3 are judged on their own.

## acceptance

- Decision: the command is a subcommand of `work` in TypeScript, parsed in work.command.ts beside `deliver`, with its logic in a new service file packages/cli/src/lib/work-revalidate.service.ts and a mirror-named spec; it reuses scalarArg and the agent resolution `deliver` uses and adds no second argument parser
- Decision: without --proposals the selection is every ready proposal whose every live slice (not retired, not dropped) has a shipped-in value and whose review-state is changes_requested; the selection is a pure function over the parsed proposals, and --proposals=<id,id> replaces it with exactly those ids, each still checked against the same predicate
- Without --proposals the command prints the chosen ids, one per line, before it changes anything, and a project with none prints that it chose none and exits 0 [<50ms]
- A spec with a fixture of one proposal per case selects only the proposal with every live slice shipped-in and changes_requested, and leaves out one with an unshipped live slice, one with a different review-state, and one not in ready/ [<50ms]
- A proposal named in --proposals that does not satisfy the predicate is reported by id with the reason and left out, and the other ids are still selected [<50ms]
- Pre-check: `delendai work prove --only=typecheck,lint-governance` passes before the slice is handed over
- Decision: the unit identity is the review batch, `review/batch-all-g<n>/<topic>`, entered with work enter --kind=review --proposal=batch --slice=all; the reason and the files proving the grammar and guards accept it are in this proposal's why (profiles.constant.ts:65-91, git-guard-review-scope.ts:36-96, declared-slice.service.ts:49, publication-target.service.ts:233, work-unit-generation.service.ts:197-211, rebuild-work-units.ts:56, review-kind.service.ts:54-62); no new kind is added
- Decision: each guard listed in the why that reads a review batch as a reviewer's verdict pack (work-unit-publish.service.ts:118 and :218, review-unit-publish-checks.service.ts, review-claim.service.ts:72, review-unit-tree.service.ts:83, unit-forge-sync.service.ts:242, unit-topic.service.ts:36) gets a spec that enters a revalidation batch and shows it is not refused and not mistaken for a review pack; a guard that already accepts it needs only the spec
- Decision: each proposal's ready to in-progress to review transitions are applied by calling the existing transition service inside the unit's worktree, one proposal at a time, from the new work-revalidate.service.ts; the command never writes a status line, and for every slice of a proposal it records the develop sha the batch is validated at in that slice's evidence through the service's own field
- The command enters one unit for the whole batch, never one per proposal: a spec counts the unit entries for a selection of three proposals and expects one [<100ms]
- A proposal whose transition is refused or fails is reported by id with the service's reason, is absent from the batch's diff, and the remaining proposals are still transitioned; a spec with one refusing fake among three expects two transitioned and one reported [<100ms]
- Nothing retries or loops: a spec with a failing fake shows the service is called once for that proposal [<100ms]
- Pre-check: `delendai work prove --only=typecheck,lint-governance,lint-architecture` passes before the slice is handed over
- Decision: before any change, one real re-delivery of a shipped-in proposal is timed step by step (work enter, dependency install, each prove step the plan prints, publish, pull request open) and the numbers are written into this proposal's why; the first piece of work is that measurement, and the acceptance below targets the largest measured part
- Decision: a unit whose diff touches only files under docs/delendai/proposals/ runs only the governance gates already named in prove-plan.script.ts: the static checks lint-governance, lint-docs and lint-security (PROPOSAL_CHECKS, line 417) and the generators agent-catalog current, docs-index current, host-hints current and roadmap drift (PROPOSAL_GENERATORS, line 425); it needs no dependency install beyond what those gates import
- The batch unit's proof is the isProposalOnly plan: a spec with a changed set of proposal files only expects earlySteps to equal PROPOSAL_GENERATORS and the static families to equal PROPOSAL_CHECKS, and a changed set with one code file expects the full plan [<50ms]
- If a transition writes generated files outside docs/delendai/proposals/ so that the batch no longer satisfies isProposalOnly, a spec states which generated paths are admitted and isProposalOnly admits exactly those and no code path [<50ms]
- A spec shows the batch run does not run the dependency install when the diff is proposal-only [<100ms]
- The measured wall time of one batch of N proposals is recorded in the proposal and is lower than N times the 3 min 18 s to 3 min 32 s measured per proposal today
- Pre-check: `delendai work prove --only=typecheck,lint-governance,lint-docs,lint-security` passes before the slice is handed over
- Decision: the command publishes the unit with the existing publish path so the product titles the pull request; it passes no title of its own, and one pull request is opened for the whole batch (publication-target.service.ts:233 publishes a batch whole)
- A spec with a fake publish port in work-revalidate.service.spec.ts expects exactly one publish call for a batch of three proposals and no title argument [<100ms]
- The CLI help summary for `work` names `revalidate` in every declared help locale, so `bun run lint:cli:i18n` passes
- The work-unit playbook has one line saying that shipped proposals sent back for fresh evidence are re-validated with `delendai work revalidate`, not one unit each, and that approving the batch is a later review batch
- Pre-check: `delendai work prove --only=typecheck,lint-docs,lint-governance` passes before the slice is handed over
