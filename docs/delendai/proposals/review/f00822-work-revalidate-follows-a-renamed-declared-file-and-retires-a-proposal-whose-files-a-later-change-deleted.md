---
id: f00822
title: "work revalidate follows a renamed declared file and retires a proposal whose files a later change deleted"
kind: feat
status: review
type: proposal
track: feats
date: 2026-11-18
last-transition-id: bea137f8-dec3-412d-ac58-2c286d226bda
last-correlation-id: bea137f8-dec3-412d-ac58-2c286d226bda
last-transition-from: in-progress
last-transition-at: 2026-11-18T10:51:37.932Z
---

# f00822 — work revalidate follows a renamed declared file and retires a proposal whose files a later change deleted

## goal

In the same batch, `delendai work revalidate` rewrites a declared path that git followed through a rename on the integration branch to its current name, and moves to retired, with superseded_by naming the proposal of the deleting commit, a proposal whose declared files were all deleted by a later merged change; a proposal it cannot resolve either way is still left out and named, with the commit that removed each file.

## why

On 2026-11-18 two revalidation runs left out 12 shipped proposals for 'declared files do not exist'. Traced on develop: renames, all R100 to *.e2e.spec.ts (98b3dceb4 'name the process-spawning specs e2e': compute-slot.service.spec.ts, acp-client.service.spec.ts; db3ca1b1b: run-cli.spec.ts), affect f00803, f00804, x01006, x01011, x01025; the rest name files deleted on purpose: d0616ffc6 'refactor(land): delete the queue, its trains, the refresher, hydration and ref maintenance' (keep-the-queue-moving.yml, open-promotion.yml, refresh-candidate-artifacts, hydrate-candidates-after-merge, queue-arming) for x00995, x01015, x01021, x01024, v00142, f00795, and 1eba86877 removing roadmap-sqlite for x00987. Fixing each by hand is twelve units and twelve pull requests for facts git already records.

## non-goals

- Guessing a rename git does not record (similarity below git's default).
- Retiring a proposal when the deleting commits name no proposal or more than one.
- Changing what revalidate selects.

## slices

- global_gate: lint

### S1 — renamed paths are rewritten and superseded proposals retired, in the batch
- **Status**: review
- **Files**: `packages/cli/src/lib/work-revalidate.service.ts`, `packages/cli/src/lib/work-revalidate.service.spec.ts`, `packages/cli/src/lib/work-revalidate-ports.service.ts`
- **Gate**: lint
- **Decisions**: none
- acceptance:
  - "For each declared path that does not exist, `delendai work revalidate` asks git for the rename that removed it on the integration branch (`git log -M --diff-filter=R --name-status -1 -- <path>`); when one exists and its target exists, it rewrites the path in that slice's Files line in the batch unit, commits it with the proposal's transitions, and keeps the proposal in the batch."
  - "When every remaining missing path of a proposal was deleted (`--diff-filter=D`) by merged commits that all name one proposal id in their subject, `delendai work revalidate` transitions it to retired through the transition service with superseded_by that id and a reason naming the deleting commit, and reports it as retired, not failed; with no id or several ids it leaves the proposal out and names each missing path with the commit that deleted it."
  - "work-revalidate.service.spec.ts covers: a renamed path (rewritten, kept); a rename whose target was later deleted (judged as deleted); a path git never knew (left out, named); one superseding id (retired); no id (left out, commit named); two ids (left out)."
- shipped-in: `27aec7ee8f2b`
- review-state: in_review
- review-implementer: claude-sonnet-5-5

## acceptance

- For each declared path that does not exist, `delendai work revalidate` asks git for the rename that removed it on the integration branch (`git log -M --diff-filter=R --name-status -1 -- <path>`); when one exists and its target exists, it rewrites the path in that slice's Files line in the batch unit, commits it with the proposal's transitions, and keeps the proposal in the batch.
- When every remaining missing path of a proposal was deleted (`--diff-filter=D`) by merged commits that all name one proposal id in their subject, `delendai work revalidate` transitions it to retired through the transition service with superseded_by that id and a reason naming the deleting commit, and reports it as retired, not failed; with no id or several ids it leaves the proposal out and names each missing path with the commit that deleted it.
- work-revalidate.service.spec.ts covers: a renamed path (rewritten, kept); a rename whose target was later deleted (judged as deleted); a path git never knew (left out, named); one superseding id (retired); no id (left out, commit named); two ids (left out).
