---
id: x01051
title: "The integration machinery never loops and never blocks its own repair"
kind: fix
status: in-progress
type: proposal
track: general
date: 2026-11-08
last-transition-id: 07c4e90a-6e4c-468f-9369-76263244d739
last-correlation-id: 07c4e90a-6e4c-468f-9369-76263244d739
last-transition-from: review
last-transition-at: 2026-11-08T17:14:05.638Z
---

# x01051 — The integration machinery never loops and never blocks its own repair

## goal

Four defects of the machinery that moves work to the integration branch share one cause: each part decides for itself from facts it gathers its own way. Make each decision one predicate read by every part that acts on it, and make the queue fall back to a plain merge when its train cannot run.

## why

S1: `work status` reports a wip ref taken off the forge and put back 30 times in a day (removed by checkout-publisher, put back by ref-maintenance). Both already read workRefFate, but gather its facts differently: the publisher judges `landed` by ancestry of the forge copy against the LOCAL integration branch (a ref at the integration tip counts as landed), ref-maintenance by isSpent against the FORGE integration branch (a ref at the tip is not spent). So one withdraws what the other restores. S2: after `work deliver`, the work ref is gone and its lease ended, so judgeAuthor finds unitEnded with no beat and calls the fresh publication orphaned (finished, last beat never, owner gone), though it only waits for its pull request. S3: on develop every accepted candidate rides a train; when the train cannot be assembled, pushed or dispatched, runTrain returns nothing and the caller clears every landing, so nothing lands, including the fix to the train. It happened twice and the owner merged by hand. S4: `work deliver --urgent=<reason>` only moves the proof ahead in the compute slot; the pull request carries nothing, so the queue cannot lead with it.

## non-goals

- Changing the train composition in tools/scripts/forge/queue-order.ts beyond the ordering input (q00045 owns it)
- Changing the work-ref fate rule itself (workRefFate)

## slices

- global_gate: none

### S1 — One predicate for a work ref's landed reading: publisher and ref-maintenance cannot disagree
- **Status**: review
- **Files**: `packages/core/src/lib/work-units/work-ref-lifecycle.service.ts`, `packages/core/src/lib/wip-engine/landed-work-ref.ts`, `packages/core/src/runtime/index.ts`, `tools/scripts/git/maintain-ref-namespace.script.ts`, `packages/core/tests/src/lib/work-units/work-ref-lifecycle.service.spec.ts`, `packages/core/tests/src/lib/wip-engine/work-checkout-publisher.spec.ts`, `tools/scripts/git/work-ref-fate-agreement.e2e.spec.ts`
- **Gate**: none
- acceptance:
  - "work-ref-lifecycle.service.ts exports workRefLanded and workRefIntegrationRef; landed-work-ref.ts and maintain-ref-namespace.script.ts both call them and neither computes landed or picks the integration ref itself"
  - "A spec on a real repository gives the checkout publisher (settleLanded) and maintainRefNamespace the same ref in each state (at the integration tip, contained in it, ahead of it, no net change, local develop lagging the forge's) and asserts that one never withdraws what the other restores"
  - "A ref sitting exactly at the integration tip is never landed, whichever caller reads it"
- shipped-in: `2569ce8f73b7`
- review-state: in_review
- review-implementer: claude-sonnet-5-5

### S2 — A delivered publication waiting for its pull request is not orphaned
- **Status**: review
- **Files**: `packages/core/src/lib/work-units/orphaned-work.service.ts`, `packages/core/src/lib/work-units/publication-standings.service.ts`, `packages/core/src/lib/contracts/interfaces/orphaned-work.interface.ts`, `packages/core/tests/src/lib/work-units/orphaned-work.service.spec.ts`, `packages/core/tests/src/lib/work-units/orphaned-work.service.e2e.spec.ts`, `packages/core/tests/src/lib/work-units/publication-standings.service.spec.ts`
- **Gate**: none
- acceptance:
  - "judgeAuthor given an ended unit whose publication tip is younger than the recovery window answers not orphaned and says it is delivered and waiting for its pull request"
  - "The same publication past the recovery window is orphaned (finished), so nothing waits forever"
  - "readOrphans passes each publication's tip time to publicationPresence, and a spec shows a just-published publication is absent from the orphans and reads owner alive"
- shipped-in: `b148381d3c4f`
- review-state: in_review
- review-implementer: claude-sonnet-5-5

### S3 — The queue falls back to each accepted candidate's own merge when the train cannot run
- **Status**: review
- **Files**: `tools/scripts/forge/keep-the-queue-moving.script.ts`, `tools/scripts/forge/train-fallback.ts`, `tools/scripts/forge/train-fallback.spec.ts`
- **Gate**: none
- acceptance:
  - "train-fallback.ts wraps the train ports and reports whether the train could not be assembled, pushed or dispatched, or threw, with the reason"
  - "When it could not, main keeps the landing it had before the train (accepted candidates whose own required checks are green, plus the repair) instead of clearing it, and says why"
  - "When the train ran or is running, nothing changes: landing is cleared as before"
  - "A spec covers pushFailure, dispatch false, a throwing assemble, a healthy train and a train waiting on its run"
- shipped-in: `e7dfafa7d04b`
- review-state: in_review
- review-implementer: claude-sonnet-5-5

### S4 — --urgent travels onto the pull request and the queue leads with it
- **Status**: review
- **DependsOn**: [S3]
- **Files**: `packages/core/src/lib/work-units/pull-request-urgency.service.ts`, `packages/core/src/lib/work-units/publication-pull-request.service.ts`, `packages/core/src/lib/work-units/work-unit-publish.service.ts`, `packages/core/src/cli.ts`, `packages/cli/src/commands/work.command.ts`, `tools/scripts/forge/queue-order.interface.ts`, `tools/scripts/forge/queue-order.ts`, `tools/scripts/forge/queue-order.spec.ts`, `tools/scripts/forge/keep-the-queue-moving.script.ts`, `packages/core/tests/src/lib/work-units/publication-pull-request.service.spec.ts`, `packages/core/tests/src/lib/work-units/pull-request-urgency.service.e2e.spec.ts`
- **Gate**: none
- acceptance:
  - "pullRequestText puts an `Urgent: <reason>` line in the body when given a reason, and a republish keeps it"
  - "pull-request-urgency.service.ts parses that line from a pull request body (the list endpoint already returns it, so the queue pays no extra call); a delivery notes the reason in the unit's git directory so the transition that publishes carries it"
  - "queueOrder sorts urgent candidates first, then by number; the train composition in queue-order.ts is untouched"
  - "A spec shows an urgent later pull request ahead of an earlier plain one, and the note is read back by the publication"
- shipped-in: `ad0565d8f4a9`
- review-state: in_review
- review-implementer: claude-sonnet-5-5

### S5 — Startup reconciliation leaves a merge, rebase or cherry-pick in progress alone while its unit is live
- **Status**: review
- **Files**: `packages/core/src/lib/work-units/unit-forge-sync.service.ts`, `packages/core/src/lib/work-units/unit-operation-in-progress.service.ts`, `packages/core/src/lib/work-units/unit-uncommitted-work.service.ts`, `packages/core/tests/src/lib/work-units/unit-forge-sync.service.spec.ts`
- **Gate**: none
- acceptance:
  - "A worktree with MERGE_HEAD, REBASE_HEAD or CHERRY_PICK_HEAD whose unit is live is left exactly as it is: no commit, no staging"
  - "The same merge in a unit that is not live is kept with a message that names the merge (the commit it merges); a rebase or cherry-pick in progress is reported and left alone, because committing in the middle of one corrupts it"
  - "A spec covers both cases on a real repository"
- shipped-in: `eb868435ddd6`
- review-state: in_review
- review-implementer: claude-sonnet-5-5

### S6 — Urgent repairs wait behind nothing in the one-by-one path, and a missing Urgent line is added
- **Status**: review
- **DependsOn**: [S4]
- **Files**: `packages/core/src/lib/work-units/pull-request-urgency.service.ts`, `packages/core/src/runtime/index.ts`, `tools/scripts/forge/queue-order.ts`, `tools/scripts/forge/queue-order.spec.ts`, `tools/scripts/forge/candidate-disposition.ts`, `tools/scripts/forge/candidate-disposition.spec.ts`, `tools/scripts/forge/keep-the-queue-moving.script.ts`, `packages/core/tests/src/lib/work-units/pull-request-urgency.service.e2e.spec.ts`
- **Gate**: none
- acceptance:
  - "queue-order.ts exports one byQueuePosition (urgent first, then oldest) that queueOrder and candidateDispositions both use, so the refresher brings an urgent candidate forward first"
  - "A pull request whose body lacks the Urgent line but whose unit noted urgency gets the line added when the queue reads it (bodyWithUrgentLine, urgencyNotePathOfPublication)"
  - "Specs cover the shared order, the disposition order and the body line"

## acceptance

- work-ref-lifecycle.service.ts exports workRefLanded and workRefIntegrationRef; landed-work-ref.ts and maintain-ref-namespace.script.ts both call them and neither computes landed or picks the integration ref itself
- A spec on a real repository gives the checkout publisher (settleLanded) and maintainRefNamespace the same ref in each state (at the integration tip, contained in it, ahead of it, no net change, local develop lagging the forge's) and asserts that one never withdraws what the other restores
- A ref sitting exactly at the integration tip is never landed, whichever caller reads it
- judgeAuthor given an ended unit whose publication tip is younger than the recovery window answers not orphaned and says it is delivered and waiting for its pull request
- The same publication past the recovery window is orphaned (finished), so nothing waits forever
- readOrphans passes each publication's tip time to publicationPresence, and a spec shows a just-published publication is absent from the orphans and reads owner alive
- train-fallback.ts wraps the train ports and reports whether the train could not be assembled, pushed or dispatched, or threw, with the reason
- When it could not, main keeps the landing it had before the train (accepted candidates whose own required checks are green, plus the repair) instead of clearing it, and says why
- When the train ran or is running, nothing changes: landing is cleared as before
- A spec covers pushFailure, dispatch false, a throwing assemble, a healthy train and a train waiting on its run
- pullRequestText puts an `Urgent: <reason>` line in the body when given a reason, and a republish keeps it
- pull-request-urgency.service.ts parses that line from a pull request body (the list endpoint already returns it, so the queue pays no extra call); a delivery notes the reason in the unit's git directory so the transition that publishes carries it
- queueOrder sorts urgent candidates first, then by number; the train composition in queue-order.ts is untouched
- A spec shows an urgent later pull request ahead of an earlier plain one, and the note is read back by the publication
