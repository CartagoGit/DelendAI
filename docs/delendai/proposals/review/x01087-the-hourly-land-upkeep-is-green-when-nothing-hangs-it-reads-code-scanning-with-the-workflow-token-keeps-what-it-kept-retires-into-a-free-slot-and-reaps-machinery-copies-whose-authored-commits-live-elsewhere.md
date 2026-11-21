---
id: x01087
title: "The hourly land upkeep is green when nothing hangs: it reads code scanning with the workflow token, keeps what it kept, retires into a free slot and reaps machinery copies whose authored commits live elsewhere"
kind: fix
status: review
type: proposal
track: architecture
date: 2026-11-17
last-transition-id: 39498a74-f396-4482-a55f-48467687e6b3
last-correlation-id: 39498a74-f396-4482-a55f-48467687e6b3
last-transition-from: in-progress
last-transition-at: 2026-11-18T13:58:24.909Z
shipped-in:
  - "98c815d26360fcafa96e64e22288ae3db854134b"
  - "76a6d0477d95193d478048cbdcf313b9d15832df"
---

# x01087 — The hourly land upkeep is green when nothing hangs: it reads code scanning with the workflow token, keeps what it kept, retires into a free slot and reaps machinery copies whose authored commits live elsewhere

## goal

`land-upkeep-develop` failed on every hourly run on 2026-11-17 (runs 44102001665 to 44157320092) for reasons that are defects of the upkeep itself, not of the forge. After this fix its `Reap` step exits 0 when every ref left is either kept on purpose or a published copy, its retire never leaves a ref because the retired slot is taken, the four `delendai/train/3b72c3b00293/*` refs (whose every authored commit is in open publications) are reaped, and its `promotion-alerts` step reads code scanning with the workflow token granted `security-events: read`, so no identity permission has to be granted by hand.

## why

Measured 2026-11-17 on develop 6c4c43f6f from run 44157320092 and a local `lint:ref-lifecycle` run. (1) tools/scripts/lint/ref-lifecycle-guard.script.ts: `keepInProgressWorkRefs` (line ~596) keeps five work refs whose proposal is in progress and prints 'kept', yet `outstanding` (line ~754) removes only `deleted`, so the same refs are then printed as 'its content is already in … should be deleted' and the step exits 1: two verdicts for one ref. (2) Silent work refs retired by `retireOnForge` (line 377) in the same pass are likewise still in `outstanding`. (3) `retireOnForge` returns false when `refs/delendai/retired/<same path>` already holds another tip; observed for f00816-all-g1, f00816-S1-g1, f00808-S8-g1 (retired 3b62c1712, wip 60a9928b4 descends from it), f00816-S6a-g1 and x01067-S3-g1, so those refs can never be retired and work:doctor stays red on them. (4) `holdsNothingOfItsOwn` (line 452) counts merge commits: the four train refs hold only the train's own clean merge commits plus authored commits 1f488a839, 89cb1c716, 97f6c6f1f, fa4f0d19d, 9c6e16e62, each verified an ancestor of an open publication (x01058-S3 / x01058-S5), yet they are reported 'may hold the only copy' and `work retire` refuses them as not a unit. (5) .github/workflows/land.yml upkeep job runs `forge:promotion-alerts` (tools/scripts/forge/promotion-alerts.script.ts:144 `code-scanning/alerts`) with the App identity token, which answers HTTP 403 'Resource not accessible by integration'; the workflow token only declares contents, pull-requests, checks and actions read. The step only reads, so the workflow token with `security-events: read` is the right credential and keeps the rule 'the workflow token only reads; every write uses the identity'. The land workflow is rendered by packages/core/src/lib/integration/land/land-workflow.helper.ts (renderLandWorkflow, upkeepStep line 93, job line 70) from tools/scripts/forge/land-workflow.script.ts REPO_VALUES.upkeep; land.yml is generated and checked, so the change is made in the template and regenerated. (6) Measured in .cache/delendai/logs/mcp-server/mcp-server.2026-11-17.log: at 18:27 and 19:24 UTC host-server#615073 logged work-checkouts.published outcome 'published', reason 'its proposal is in progress and the forge lost its unit: the ref goes back' (packages/core/src/lib/integration/decisions/landed.helper.ts:86, called from wip-engine/landed-work-ref.ts settleLanded) for q00045-S3-g3 and x01032-S2-g1 minutes after the upkeep had retired them to refs/delendai/retired/…; the two rules undo each other every hour.

## non-goals

- The work:doctor checks publications-move and in-progress-has-units: they report real stalled pull requests and proposals, which are fixed by their owners.

## slices

- global_gate: none

### S1 — The reap step judges each ref once, retires into a free slot and reaps machinery copies by authored commits
- **Status**: pending
- **Files**: `tools/scripts/lint/ref-lifecycle-guard.script.ts`, `tools/scripts/lint/ref-lifecycle-guard.script.spec.ts`
- **Gate**: none
- acceptance:
  - "Decision: a ref printed as kept by keepInProgressWorkRefs, or retired in this pass (closed publication or silent work ref), is removed from `outstanding` exactly like a deleted one; the set is built once from those three results, and no second keep rule is added (the one reading stays keepInProgressWorkRefs / proposalInProgress)"
  - "Decision: retireOnForge, when the retired slot already holds another tip, first checks whether that tip is an ancestor of the new sha (git merge-base --is-ancestor through the injected runner); if so it moves the retired ref forward with a non-forced PATCH and then deletes the branch; otherwise it writes the new tip to `<retiredRef>-<first 12 hex of sha>` and deletes the branch; it never forces and never overwrites a tip that is not an ancestor"
  - "Decision: holdsNothingOfItsOwn counts only authored commits, `rev-list --count --no-merges <sha> --not <holders>`, and it is applied only to refs under the retired-machinery prefixes, as today; the reason is that the train machinery merged only without conflicts, so its merge commits carry no authored change"
  - "A spec feeds the verdict builder a ref that is both kept and reported as published-copy and expects it absent from the failing list and the step result ok [<50ms]"
  - "A spec with a fake runner whose create of the retired ref fails and whose kept tip is an ancestor expects one PATCH to the same retired ref and one branch delete; with a non-ancestor kept tip it expects one create at `<retiredRef>-<12 hex>` and one delete; no call is forced [<50ms]"
  - "A spec with a fake runner expects `--no-merges` in the rev-list arguments of holdsNothingOfItsOwn and returns true when the fake answers 0 [<50ms]"
  - "Pre-check: `delendai work prove --only=typecheck,lint-biome,lint-architecture,changed-file-coverage` passes before the slice is handed over"
- shipped-in: `5aec6a44d6fb`
- review-state: changes_requested
- review-implementer: claude-opus-5-5
- review-reviewer: mimo-v2.6-flash
- review-log: requested_changes by mimo-v2.6-flash — S1 is sent back. Its three required specs exist and pass (36/36 in ref-lifecycle-guard.script.spec.ts) and decisions 2 and 3 are implemented exactly as written: retireOnForge keeps an ancestor tip with one non-forced PATCH and otherwise writes `<retiredRef>-<first 12 hex>`; holdsNothingOfItsOwn runs `rev-list --count --no-merges <sha> --not <holders>`.

Decision 1 is no longer true of the code as it stands. It requires that a ref printed as kept, or retired in this pass (closed publication or silent work ref), is removed from `outstanding`, and that the set is built once from those three results. The delivery did build it that way — 0fb244ac1 added `resolved.add(...)` for the retirable, the silent and the deleted results. A later change, eeba10c8d (2026-11-18, "refactor(ref-reconciler): … the guard only reports"), deleted all three adds together with the `--reap` path. On develop `resolved` therefore holds only `kept` — `grep -n "resolved.add" tools/scripts/lint/ref-lifecycle-guard.script.ts` finds nothing — and `reapVerdict(result.needsAttention, resolved, result.reapable, …)` keeps everything else.

Concretely: `silentWorkRefs` filters `!ref.published`, so a ref the guard prints at line 805 as `retirable … the reconciler keeps its tip at …` has role `work-abandoned` (reconcile.service.ts:176-180), which IS in `needsAttention` (:280) and is NOT in `reapable` (:267-271). It stays in `outstanding`, and under `REF_LIFECYCLE_SCOPE=repository` — the hourly upkeep job's own scope — `failingFor` returns it as failing. The guard prints two verdicts for one ref, which is exactly what `why` (1) and (2) say must stop.

What must hold: every ref the guard prints as kept or as retirable is absent from `outstanding` and from `failing`, decided by one set built once from those results; and a spec feeds `reapVerdict` a silent, never-published ref that the guard printed as retirable and expects it out of the failing list with `ok` true, next to the existing kept-and-published-copy case.

This is a regression introduced by eeba10c8d, not by the delivery, but the acceptance describes the code as it stands, so S1 cannot be approved while it is false.

### S2 — An upkeep step can read with the workflow token and the job is granted exactly that read
- **Status**: done
- **Files**: `packages/core/src/lib/integration/land/land.interface.ts`, `packages/core/src/lib/integration/land/land-workflow.helper.ts`, `packages/core/tests/src/lib/integration/land/land-workflow.helper.spec.ts`, `tools/scripts/forge/land-workflow.script.ts`, `.github/workflows/land.yml`
- **Gate**: none
- acceptance:
  - "Decision: ILandUpkeepStep gains `readsWithWorkflowToken?: readonly string[]`, the GitHub permission names the step reads (here ['security-events']); such a step renders `GH_TOKEN: ${{ github.token }}` instead of the identity token, and the upkeep job renders a `permissions:` block equal to the workflow's read permissions (contents, pull-requests, checks, actions, all read, taken from one constant that the top-level block also renders) plus each named permission as read; with no such step the job renders no permissions block, so every other project's output is byte-identical"
  - "Decision: tools/scripts/forge/land-workflow.script.ts marks only the 'Fail while a code scanning alert is open on the integration branch' step with readsWithWorkflowToken ['security-events']; land.yml is regenerated with the repository's land workflow generator, never hand-edited"
  - "A spec renders an upkeep with one readsWithWorkflowToken step and expects that step's GH_TOKEN to be the workflow token, the other steps' GH_TOKEN the identity token, and the upkeep job's permissions to be the four reads plus security-events read; a second spec with no such step expects no job-level permissions block [<50ms]"
  - "The land workflow `--check` passes on the regenerated .github/workflows/land.yml, and its diff touches only the upkeep job"
  - "Pre-check: `delendai work prove --only=typecheck,lint-biome,lint-architecture,changed-file-coverage` passes before the slice is handed over"
- shipped-in: `98c815d26360`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: mimo-v2.6-flash
- review-log: approved by mimo-v2.6-flash — verified at 98c815d26360, validate exit 0 and tests 12/12 claimed, no recorded run cited; acceptance 5/5: (1) land.interface.ts:264 declares `readsWithWorkflowToken?: readonly string[]`; land-workflow.helper.ts:126-128 renders `GH_TOKEN: ${{ github.token }}` for such a… (2) the only product-code marker is tools/scripts/forge/land-workflow.script.ts:67 (`readsWithWorkflowToken: ['security-events']` on the "Fail while a code scannin… (3) land-workflow.helper.spec.ts:118-153 has the spec with a reading step (GH_TOKEN the workflow token on the reading step, the identity token on the writing one, … (4) `bun tools/scripts/forge/land-workflow.script.ts --check` exits 0, and the land.yml diff in da9fc969a is two hunks, both inside the `upkeep:` job (the permissi… (5) no on-disk record of the prove run exists to re-read, so this is reported as claimed: the slice's Gate is `none`, and `bun run typecheck` exits 0 across all 80… — Approved at 98c815d26360f, the merge that delivered S2 and an ancestor of develop; no later x01087 delivery touches its five files. Gate is none: `bun run typecheck` exits 0 across all 80 workspaces, land-workflow.helper.spec.ts is 12/12, and `bun tools/scripts/forge/land-workflow.script.ts --check` exits 0 with the regenerated land.yml diff limited to two hunks inside the upkeep job. The full `bun run validate` in this review unit is red only on lint-governance's `closed-with-independent-approval`, a false positive that mis-parses this unit's own work ref (kindOfRef/agentOfRef read the legacy agent-first shape while f00808 S8 made work refs kind-first); every other job passes and that defect is filed separately. S1 and S3 are judged on their own.

### S3 — The host does not put back a unit the forge retired
- **Status**: done
- **Files**: `packages/core/src/lib/contracts/interfaces/work-ref-lifecycle.interface.ts`, `packages/core/src/lib/integration/decisions/landed.helper.ts`, `packages/core/tests/src/lib/integration/decisions/landed.helper.spec.ts`, `packages/core/src/lib/wip-engine/landed-work-ref.ts`, `packages/core/tests/src/lib/wip-engine/work-checkout-publisher.spec.ts`
- **Gate**: none
- acceptance:
  - "Decision: IWorkRefFacts gains `retiredOnForge: boolean`, true when the forge holds `refs/delendai/retired/<the same unit path>` (the path planRetirement in packages/core/src/lib/work-units/work-retire.service.ts computes, the one the reaper writes); settleLanded in packages/core/src/lib/wip-engine/landed-work-ref.ts reads it with one `ls-remote` of that ref beside the one it already makes"
  - "Decision: workRefFate, for a ref whose proposal is open and which is not on the forge, returns fate 'withdraw' with reason 'the forge retired this unit: it is not put back; its next commit of its own publishes it again' when retiredOnForge is true, and 'restore' as today otherwise; no other branch of workRefFate changes, and no second reading of 'is this proposal going' is added"
  - "A spec of workRefFate with proposal open, onForge false and retiredOnForge true expects fate withdraw, and with retiredOnForge false expects restore [<50ms]"
  - "A spec of settleLanded with a fake runner whose ls-remote answers the retired ref expects no push call and outcome not published [<50ms]"
  - "Pre-check: `delendai work prove --only=typecheck,lint-biome,lint-architecture,changed-file-coverage` passes before the slice is handed over"
- shipped-in: `76a6d0477d95`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: mimo-v2.6-flash
- review-log: approved by mimo-v2.6-flash — verified at 76a6d0477d95, validate exit 0 and tests 12/12 claimed, no recorded run cited; acceptance 5/5: (1) work-ref-lifecycle.interface.ts:15-16 declares `retiredOnForge: boolean`; forgeHoldsRetired issues one `ls-remote` over the retiredRefsOf patterns (which inclu… (2) landed.helper.ts:76-90: proposal open and not on the forge and retiredOnForge → fate 'withdraw' with the exact reason at :88 "the forge retired this unit: it i… (3) landed.helper.spec.ts:48-59 builds facts(retiredOnForge) and `withdraws a unit the forge retired and restores one it lost` expects fate withdraw for true and r… (4) work-checkout-publisher.spec.ts:331 `does not push back a unit that was retired on the remote` drives settleLanded against a remote that answers the retired re… (5) same as S2: Gate is `none`, no on-disk prove record; `bun run typecheck` exits 0 across all 80 workspaces in this checkout, and lint-governance is 31/32 with t… — Approved at 76a6d0477d95, the merge that delivered S3 and an ancestor of develop; no later x01087 delivery touches its five files. Gate is none: `bun run typecheck` exits 0 across all 80 workspaces, landed.helper.spec.ts covers withdraw and restore, and work-checkout-publisher.spec.ts has `does not push back a unit that was retired on the remote`. Same validate note as S2: only lint-governance's `closed-with-independent-approval` fails, on this review unit's own work ref, filed separately. S1 and S2 are judged on their own.

## acceptance

- Decision: a ref printed as kept by keepInProgressWorkRefs, or retired in this pass (closed publication or silent work ref), is removed from `outstanding` exactly like a deleted one; the set is built once from those three results, and no second keep rule is added (the one reading stays keepInProgressWorkRefs / proposalInProgress)
- Decision: retireOnForge, when the retired slot already holds another tip, first checks whether that tip is an ancestor of the new sha (git merge-base --is-ancestor through the injected runner); if so it moves the retired ref forward with a non-forced PATCH and then deletes the branch; otherwise it writes the new tip to `<retiredRef>-<first 12 hex of sha>` and deletes the branch; it never forces and never overwrites a tip that is not an ancestor
- Decision: holdsNothingOfItsOwn counts only authored commits, `rev-list --count --no-merges <sha> --not <holders>`, and it is applied only to refs under the retired-machinery prefixes, as today; the reason is that the train machinery merged only without conflicts, so its merge commits carry no authored change
- A spec feeds the verdict builder a ref that is both kept and reported as published-copy and expects it absent from the failing list and the step result ok [<50ms]
- A spec with a fake runner whose create of the retired ref fails and whose kept tip is an ancestor expects one PATCH to the same retired ref and one branch delete; with a non-ancestor kept tip it expects one create at `<retiredRef>-<12 hex>` and one delete; no call is forced [<50ms]
- A spec with a fake runner expects `--no-merges` in the rev-list arguments of holdsNothingOfItsOwn and returns true when the fake answers 0 [<50ms]
- Pre-check: `delendai work prove --only=typecheck,lint-biome,lint-architecture,changed-file-coverage` passes before the slice is handed over
- Decision: ILandUpkeepStep gains `readsWithWorkflowToken?: readonly string[]`, the GitHub permission names the step reads (here ['security-events']); such a step renders `GH_TOKEN: ${{ github.token }}` instead of the identity token, and the upkeep job renders a `permissions:` block equal to the workflow's read permissions (contents, pull-requests, checks, actions, all read, taken from one constant that the top-level block also renders) plus each named permission as read; with no such step the job renders no permissions block, so every other project's output is byte-identical
- Decision: tools/scripts/forge/land-workflow.script.ts marks only the 'Fail while a code scanning alert is open on the integration branch' step with readsWithWorkflowToken ['security-events']; land.yml is regenerated with the repository's land workflow generator, never hand-edited
- A spec renders an upkeep with one readsWithWorkflowToken step and expects that step's GH_TOKEN to be the workflow token, the other steps' GH_TOKEN the identity token, and the upkeep job's permissions to be the four reads plus security-events read; a second spec with no such step expects no job-level permissions block [<50ms]
- The land workflow `--check` passes on the regenerated .github/workflows/land.yml, and its diff touches only the upkeep job
- Pre-check: `delendai work prove --only=typecheck,lint-biome,lint-architecture,changed-file-coverage` passes before the slice is handed over
- Decision: IWorkRefFacts gains `retiredOnForge: boolean`, true when the forge holds `refs/delendai/retired/<the same unit path>` (the path planRetirement in packages/core/src/lib/work-units/work-retire.service.ts computes, the one the reaper writes); settleLanded in packages/core/src/lib/wip-engine/landed-work-ref.ts reads it with one `ls-remote` of that ref beside the one it already makes
- Decision: workRefFate, for a ref whose proposal is open and which is not on the forge, returns fate 'withdraw' with reason 'the forge retired this unit: it is not put back; its next commit of its own publishes it again' when retiredOnForge is true, and 'restore' as today otherwise; no other branch of workRefFate changes, and no second reading of 'is this proposal going' is added
- A spec of workRefFate with proposal open, onForge false and retiredOnForge true expects fate withdraw, and with retiredOnForge false expects restore [<50ms]
- A spec of settleLanded with a fake runner whose ls-remote answers the retired ref expects no push call and outcome not published [<50ms]
- Pre-check: `delendai work prove --only=typecheck,lint-biome,lint-architecture,changed-file-coverage` passes before the slice is handed over
