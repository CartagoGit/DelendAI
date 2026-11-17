---
id: x01087
title: "The hourly land upkeep is green when nothing hangs: it reads code scanning with the workflow token, keeps what it kept, retires into a free slot and reaps machinery copies whose authored commits live elsewhere"
kind: fix
status: ready
type: proposal
track: architecture
date: 2026-11-17
---

# x01087 — The hourly land upkeep is green when nothing hangs: it reads code scanning with the workflow token, keeps what it kept, retires into a free slot and reaps machinery copies whose authored commits live elsewhere

## goal

`land-upkeep-develop` failed on every hourly run on 2026-11-17 (runs 44102001665 to 44157320092) for reasons that are defects of the upkeep itself, not of the forge. After this fix its `Reap` step exits 0 when every ref left is either kept on purpose or a published copy, its retire never leaves a ref because the retired slot is taken, the four `delendai/train/3b72c3b00293/*` refs (whose every authored commit is in open publications) are reaped, and its `promotion-alerts` step reads code scanning with the workflow token granted `security-events: read`, so no identity permission has to be granted by hand.

## why

Measured 2026-11-17 on develop 6c4c43f6f from run 44157320092 and a local `lint:ref-lifecycle` run. (1) tools/scripts/lint/ref-lifecycle-guard.script.ts: `keepInProgressWorkRefs` (line ~596) keeps five work refs whose proposal is in progress and prints 'kept', yet `outstanding` (line ~754) removes only `deleted`, so the same refs are then printed as 'its content is already in … should be deleted' and the step exits 1: two verdicts for one ref. (2) Silent work refs retired by `retireOnForge` (line 377) in the same pass are likewise still in `outstanding`. (3) `retireOnForge` returns false when `refs/delendai/retired/<same path>` already holds another tip; observed for f00816-all-g1, f00816-S1-g1, f00808-S8-g1 (retired 3b62c1712, wip 60a9928b4 descends from it), f00816-S6a-g1 and x01067-S3-g1, so those refs can never be retired and work:doctor stays red on them. (4) `holdsNothingOfItsOwn` (line 452) counts merge commits: the four train refs hold only the train's own clean merge commits plus authored commits 1f488a839, 89cb1c716, 97f6c6f1f, fa4f0d19d, 9c6e16e62, each verified an ancestor of an open publication (x01058-S3 / x01058-S5), yet they are reported 'may hold the only copy' and `work retire` refuses them as not a unit. (5) .github/workflows/land.yml upkeep job runs `forge:promotion-alerts` (tools/scripts/forge/promotion-alerts.script.ts:144 `code-scanning/alerts`) with the App identity token, which answers HTTP 403 'Resource not accessible by integration'; the workflow token only declares contents, pull-requests, checks and actions read. The step only reads, so the workflow token with `security-events: read` is the right credential and keeps the rule 'the workflow token only reads; every write uses the identity'. The land workflow is rendered by packages/core/src/lib/integration/land/land-workflow.helper.ts (renderLandWorkflow, upkeepStep line 93, job line 70) from tools/scripts/forge/land-workflow.script.ts REPO_VALUES.upkeep; land.yml is generated and checked, so the change is made in the template and regenerated.

## non-goals

- Why reaped work refs of idle local worktrees reappear on the forge at the develop tip (q00045-S3-g3, x01032-S2-g1 on 2026-11-17): a separate proposal after it is measured.
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

### S2 — An upkeep step can read with the workflow token and the job is granted exactly that read
- **Status**: pending
- **Files**: `packages/core/src/lib/integration/land/land.interface.ts`, `packages/core/src/lib/integration/land/land-workflow.helper.ts`, `packages/core/tests/src/lib/integration/land/land-workflow.helper.spec.ts`, `tools/scripts/forge/land-workflow.script.ts`, `.github/workflows/land.yml`
- **Gate**: none
- acceptance:
  - "Decision: ILandUpkeepStep gains `readsWithWorkflowToken?: readonly string[]`, the GitHub permission names the step reads (here ['security-events']); such a step renders `GH_TOKEN: ${{ github.token }}` instead of the identity token, and the upkeep job renders a `permissions:` block equal to the workflow's read permissions (contents, pull-requests, checks, actions, all read, taken from one constant that the top-level block also renders) plus each named permission as read; with no such step the job renders no permissions block, so every other project's output is byte-identical"
  - "Decision: tools/scripts/forge/land-workflow.script.ts marks only the 'Fail while a code scanning alert is open on the integration branch' step with readsWithWorkflowToken ['security-events']; land.yml is regenerated with the repository's land workflow generator, never hand-edited"
  - "A spec renders an upkeep with one readsWithWorkflowToken step and expects that step's GH_TOKEN to be the workflow token, the other steps' GH_TOKEN the identity token, and the upkeep job's permissions to be the four reads plus security-events read; a second spec with no such step expects no job-level permissions block [<50ms]"
  - "The land workflow `--check` passes on the regenerated .github/workflows/land.yml, and its diff touches only the upkeep job"
  - "Pre-check: `delendai work prove --only=typecheck,lint-biome,lint-architecture,changed-file-coverage` passes before the slice is handed over"

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
