---
id: x01100
title: "A claim is a lease that only stops two agents editing the same thing at once, and nobody owns work once it is handed over or published"
kind: fix
status: in-progress
type: proposal
track: workflow
date: 2026-11-19
last-transition-id: 4726e350-85e1-4eed-a646-dcfc5b8be8cf
last-correlation-id: 4726e350-85e1-4eed-a646-dcfc5b8be8cf
last-transition-from: ready
last-transition-at: 2026-11-19T11:30:56.787Z
---

# x01100 — A claim is a lease that only stops two agents editing the same thing at once, and nobody owns work once it is handed over or published

## goal

Every refusal that checks who owns a unit, a slice or a proposal after hand-over is removed or turned into a check of a LIVE lease; any agent may re-enter a handed-over or published unit, fix its pull request or continue its proposal; PR admission, land and review never wait for an owner.

## why

Owner decision 2026-11-19: a claim or assignment is a lease that only prevents two agents editing the same thing at the same time; once work is handed over or published nobody owns it and authorship stays in commits and trailers. Today work enter refuses a slice 'already being worked on by another agent' while the unit is idle or only published (slice-holders.service.ts unitsOnSlice counts published units with ahead>0, isUnitHolding keeps idle and waiting units), refuses a worktree 'held by another session', hands a new generation to an agent with a unit it created and never committed to, refuses retire of a unit that is 'its owner's to retire', refuses a checkpoint scope that is 'already somebody else's work' from any ref even a published one, refuses close_slice when the actor is not the work-ref's agent, and land labels needs-update and waits for its author even when the merge is clean. Inventory (grep of packages, plugins, tools): 21 ownership or session refusals; 10 guard concurrent editing and are kept (as live-lease checks), 11 guard ownership after hand-over and are removed or become live-lease checks. Keep: execute-lock-action.ts claim conflict (line 108) and release/heartbeat identity (372, 495); work-checkout-publisher.ts:96 publish hold; review-claim.service.ts:297 (one verdict per proposal at a time); slice-reservation.service.ts:236-266 forge reservation while live; work-unit-checkpoint.service.ts:76-85 and scope-collision.service.ts:55 for LIVE units only; wip-persistence.ts:201 WIP_SLICE_HELD and slice-holders.service.ts:127-137 for LIVE units only; work-unit-generation.service.ts:200-203 (a live session holds the generation); taken-proposal-id.service.ts:26 (id allocation); unit-fence and with-file-mutex. Remove or convert: work-unit-enter.service.ts:204-222 (slice holders incl. idle and published), work-unit-enter.service.ts:271-273 and 294 plus work-unit-shared.service.ts:338 heldByAnother (worktree held by another session), work-unit-generation.service.ts:233-241 (being worked on by another session when its lease is not live) and :303-316 (existingWorkRef skips a continued branch held by another session), work-unit-generation.service.ts:224-231 (own open publication refuses re-entry), work-unit-retire.service.ts:146-155 (its owner's to retire), unit-standings.service.ts:182-188 and unit-verdict.service.ts:39-52 (claimedByOther), close-actor.resolver.ts:109-115 with validation-provider.ts:194 and close-blocker.ts:50 (a live claim that is not yours blocks a close after hand-over), work-claim.service.ts:87 and work-unit-claim.service.ts (take-over becomes re-entry; claim stays as a rename), land.helper.ts:111-112, 240-245, 309-323 and land-bring-forward.helper.ts:123 (needs-update waits for the author on a clean merge; the queued auto bring-forward idea). No refusal checks proposal authorship or PR assignment today (grep of author, assignee, owner_agent in proposals, github and integration plugins finds none besides recovery-tools.ts:759 lock-owner-mismatch, a diagnostic); the specs pin that.

## non-goals

- Removing a live lease or a file lock: two agents still cannot edit the same slice, path or proposal file at once.
- Changing how a lease is heartbeated or how the idle window is configured: coordination.leaseTtlMinutes stays the one knob.
- Changing review independence (a reviewer cannot approve what it implemented): that is authorship in commits, not a lease.

## slices

- global_gate: type

### S1 — One lease model: live only while the heartbeat is inside the idle window
- **Status**: pending
- **Files**: `packages/core/src/lib/work-units/unit-lease.interface.ts`, `packages/core/src/lib/work-units/unit-lease.service.ts`, `packages/core/src/lib/work-units/unit-standings.service.ts`, `packages/core/src/lib/work-units/unit-verdict.service.ts`, `packages/core/src/lib/work-units/slice-holders.service.ts`, `packages/core/src/lib/work-units/slice-reservation.service.ts`, `packages/core/src/lib/work-units/scope-collision.service.ts`, `packages/core/src/lib/work-units/work-unit-checkpoint.service.ts`, `plugins/commit-policy/src/lib/persistence/wip-persistence.ts`, `plugins/proposals/src/lib/services/claim-liveness.service.ts`
- **Gate**: type
- **Decisions**: none
- acceptance:
  - "packages/core/tests/src/lib/work-units/unit-standings.service.spec.ts: a unit holds (isUnitHolding) only when its standing is live; idle, abandoned, delivered, waiting and published-and-handed-over units hold nothing, and a released or expired lease is free."
  - "packages/core/tests/src/lib/work-units/slice-holders.service.spec.ts: holdersOfSlice and readSliceOwnership return a unit only when its lease is live; a published unit with ahead>0 and a quiet lease is not a holder."
  - "packages/core/tests/src/lib/work-units/scope-collision.service.spec.ts: collisionsWith reports only units whose lease is live."
  - "packages/core/tests/src/lib/work-units/unit-standings.service.spec.ts: claimedByOther no longer changes a standing; the lease owner is evidence of liveness only."
  - "packages/core/tests/src/lib/work-units/work-unit-enter.service.spec.ts: the refusal text of a live-lease block names the lease heartbeat age and the idle window, and no refusal text in packages/core/src/lib/work-units says 'someone else' or 'another session'."

### S2 — Re-entry: any agent enters a handed-over or published unit; a new generation only against a live lease
- **Status**: pending
- **Files**: `packages/core/src/lib/work-units/work-unit-enter.service.ts`, `packages/core/src/lib/work-units/work-unit-generation.service.ts`, `packages/core/src/lib/work-units/work-unit-shared.service.ts`, `packages/core/src/lib/work-units/work-unit-retire.service.ts`, `packages/core/src/lib/work-units/work-unit-claim.service.ts`, `packages/core/src/lib/work-units/work-claim.service.ts`, `packages/core/src/lib/work-units/proposal-branch.service.ts`, `packages/core/src/lib/contracts/constants/work-arguments.constant.ts`
- **Gate**: type
- **Decisions**: none
- acceptance:
  - "packages/core/tests/src/lib/work-units/work-unit-enter.service.spec.ts: agent B enters --proposal=<id> --slice=<id> of a unit agent A published or left idle, and gets that unit (created:false, same ref and worktree) instead of 'already being worked on by another agent' or 'held by another session'."
  - "packages/core/tests/src/lib/work-units/work-unit-generation.service.spec.ts: a new generation is chosen only when a unit of the slice has a live lease; with every lease expired or released the current generation is reused."
  - "packages/core/tests/src/lib/work-units/work-unit-generation.service.spec.ts: the same agent running enter again from the shared checkout, with a unit it created and no commits, gets that unit back rather than generation n+1."
  - "packages/core/tests/src/lib/work-units/work-retire.service.e2e.spec.ts: agent B retires an idle unit entered by agent A, without 'its owner's to retire'; a live unit of another agent is still refused."
  - "packages/core/tests/src/lib/work-units/work-unit-enter.service.spec.ts: with agent A's lease live, agent B's enter on the same slice is still refused and names the lease heartbeat age."

### S3 — Proposal editing, closing and transitions check only live leases on the same file
- **Status**: pending
- **Files**: `plugins/proposals/src/lib/swarm/close-actor.resolver.ts`, `plugins/proposals/src/lib/swarm/validation-provider.ts`, `plugins/proposals/src/lib/services/close-blocker.ts`, `plugins/proposals/src/lib/locks/execute-lock-action.ts`, `plugins/proposals/src/lib/tools/recovery-tools.ts`
- **Gate**: type
- **Decisions**: none
- acceptance:
  - "plugins/proposals/tests/src/lib/swarm/close-actor.resolver.spec.ts: an agent whose lease holds the unit it stands in owns it, whatever agent the work ref is named after; ownsUnit no longer compares the ref's agent with the caller."
  - "plugins/proposals/tests/src/lib/services/close-blocker.spec.ts: a claim whose heartbeat is stale or released is not reported as 'held by' another agent; only a live claim on the same task blocks."
  - "plugins/proposals/tests/src/lib/agent-lock-contention.spec.ts: a second agent claims the files of a task whose holder's lease expired, and is refused while the holder's lease is live."
  - "plugins/proposals/tests/src/lib/tools/recovery-tools.spec.ts: lock-owner-mismatch is only reported for a live lock of another agent."
  - "plugins/proposals/tests/src/lib/tools/recovery-tools.spec.ts: creating, editing and transitioning a proposal as a second agent after the first handed it over succeeds, and no refusal reads owner_agent, author or assignee."

### S4 — Land and review never wait for an owner: a clean merge is brought forward by the integration identity
- **Status**: pending
- **Files**: `packages/core/src/lib/integration/land/land.helper.ts`, `packages/core/src/lib/integration/land/land-bring-forward.helper.ts`, `packages/core/src/lib/integration/land/land-labels.helper.ts`, `packages/core/src/lib/integration/land/land.constant.ts`, `plugins/integration/src/lib/services/rehearsal-expectation.service.ts`, `plugins/proposals/src/lib/services/review-claim.service.ts`
- **Gate**: type
- **Decisions**: none
- acceptance:
  - "packages/core/tests/src/lib/integration/land/land-bring-forward.helper.spec.ts: a pull request whose touched files changed on the integration branch since its checks ran, and which merges cleanly, is brought forward through the integration identity and is not labelled needs-update."
  - "packages/core/tests/src/lib/integration/land/land-bring-forward.helper.spec.ts: only a real conflict in authored code is labelled needs-update, and the comment names the conflicting paths, not an author."
  - "packages/core/tests/src/lib/integration/land/land-workflow.helper.spec.ts: land and review read no assignment or author to decide what to do with a pull request."
  - "plugins/proposals/tests/src/lib/services/review-claim.service.spec.ts: a review claim held by a unit with an expired lease is free, a live one still refuses a second verdict."

### S5 — A spec per removed refusal: a second agent proceeds after hand-over, a live lease still blocks
- **Status**: pending
- **DependsOn**: [S1, S2, S3, S4]
- **Files**: `new:packages/core/tests/src/lib/work-units/lease-not-ownership.e2e.spec.ts`, `packages/core/tests/src/lib/work-units/work-unit-checkpoint.service.e2e.spec.ts`, `packages/core/tests/src/lib/work-units/slice-reservation.service.e2e.spec.ts`
- **Gate**: type
- **Decisions**: none
- acceptance:
  - "packages/core/tests/src/lib/work-units/lease-not-ownership.e2e.spec.ts: one case per removed refusal (slice holder, held-by-another-session, new-generation, own-publication, retire, scope collision, forge reservation) in which agent B proceeds after agent A handed over or published, and a twin case in which A's live lease still blocks B."
  - "packages/core/tests/src/lib/work-units/work-unit-checkpoint.service.e2e.spec.ts: a checkpoint of a path another agent's published, quiet unit touched is accepted; the same path touched by a live unit is refused."
  - "packages/core/tests/src/lib/work-units/slice-reservation.service.e2e.spec.ts: a forge reservation whose unit has been silent past the idle window is taken over; a live one is refused."
  - "`bun x vitest run --project core packages/core/tests/src/lib/work-units/lease-not-ownership.e2e.spec.ts` passes."

## acceptance

- packages/core/tests/src/lib/work-units/unit-standings.service.spec.ts: a unit holds (isUnitHolding) only when its standing is live; idle, abandoned, delivered, waiting and published-and-handed-over units hold nothing, and a released or expired lease is free.
- packages/core/tests/src/lib/work-units/slice-holders.service.spec.ts: holdersOfSlice and readSliceOwnership return a unit only when its lease is live; a published unit with ahead>0 and a quiet lease is not a holder.
- packages/core/tests/src/lib/work-units/scope-collision.service.spec.ts: collisionsWith reports only units whose lease is live.
- packages/core/tests/src/lib/work-units/unit-standings.service.spec.ts: claimedByOther no longer changes a standing; the lease owner is evidence of liveness only.
- packages/core/tests/src/lib/work-units/work-unit-enter.service.spec.ts: the refusal text of a live-lease block names the lease heartbeat age and the idle window, and no refusal text in packages/core/src/lib/work-units says 'someone else' or 'another session'.
- packages/core/tests/src/lib/work-units/work-unit-enter.service.spec.ts: agent B enters --proposal=<id> --slice=<id> of a unit agent A published or left idle, and gets that unit (created:false, same ref and worktree) instead of 'already being worked on by another agent' or 'held by another session'.
- packages/core/tests/src/lib/work-units/work-unit-generation.service.spec.ts: a new generation is chosen only when a unit of the slice has a live lease; with every lease expired or released the current generation is reused.
- packages/core/tests/src/lib/work-units/work-unit-generation.service.spec.ts: the same agent running enter again from the shared checkout, with a unit it created and no commits, gets that unit back rather than generation n+1.
- packages/core/tests/src/lib/work-units/work-retire.service.e2e.spec.ts: agent B retires an idle unit entered by agent A, without 'its owner's to retire'; a live unit of another agent is still refused.
- packages/core/tests/src/lib/work-units/work-unit-enter.service.spec.ts: with agent A's lease live, agent B's enter on the same slice is still refused and names the lease heartbeat age.
- plugins/proposals/tests/src/lib/swarm/close-actor.resolver.spec.ts: an agent whose lease holds the unit it stands in owns it, whatever agent the work ref is named after; ownsUnit no longer compares the ref's agent with the caller.
- plugins/proposals/tests/src/lib/services/close-blocker.spec.ts: a claim whose heartbeat is stale or released is not reported as 'held by' another agent; only a live claim on the same task blocks.
- plugins/proposals/tests/src/lib/agent-lock-contention.spec.ts: a second agent claims the files of a task whose holder's lease expired, and is refused while the holder's lease is live.
- plugins/proposals/tests/src/lib/tools/recovery-tools.spec.ts: lock-owner-mismatch is only reported for a live lock of another agent.
- plugins/proposals/tests/src/lib/tools/recovery-tools.spec.ts: creating, editing and transitioning a proposal as a second agent after the first handed it over succeeds, and no refusal reads owner_agent, author or assignee.
- packages/core/tests/src/lib/integration/land/land-bring-forward.helper.spec.ts: a pull request whose touched files changed on the integration branch since its checks ran, and which merges cleanly, is brought forward through the integration identity and is not labelled needs-update.
- packages/core/tests/src/lib/integration/land/land-bring-forward.helper.spec.ts: only a real conflict in authored code is labelled needs-update, and the comment names the conflicting paths, not an author.
- packages/core/tests/src/lib/integration/land/land-workflow.helper.spec.ts: land and review read no assignment or author to decide what to do with a pull request.
- plugins/proposals/tests/src/lib/services/review-claim.service.spec.ts: a review claim held by a unit with an expired lease is free, a live one still refuses a second verdict.
- packages/core/tests/src/lib/work-units/lease-not-ownership.e2e.spec.ts: one case per removed refusal (slice holder, held-by-another-session, new-generation, own-publication, retire, scope collision, forge reservation) in which agent B proceeds after agent A handed over or published, and a twin case in which A's live lease still blocks B.
- packages/core/tests/src/lib/work-units/work-unit-checkpoint.service.e2e.spec.ts: a checkpoint of a path another agent's published, quiet unit touched is accepted; the same path touched by a live unit is refused.
- packages/core/tests/src/lib/work-units/slice-reservation.service.e2e.spec.ts: a forge reservation whose unit has been silent past the idle window is taken over; a live one is refused.
- `bun x vitest run --project core packages/core/tests/src/lib/work-units/lease-not-ownership.e2e.spec.ts` passes.
