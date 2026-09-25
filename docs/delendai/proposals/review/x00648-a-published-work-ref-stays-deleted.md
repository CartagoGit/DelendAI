---
id: x00648
title: "A published work ref stays deleted"
kind: fix
status: review
type: proposal
track: trust
date: 2026-09-25
priority: P1
related: [x00635, x00568]
last-transition-id: d25e8d99-9c26-4eef-8186-329505d42830
last-correlation-id: d25e8d99-9c26-4eef-8186-329505d42830
last-transition-from: in-progress
---

# x00648 — A published work ref stays deleted

## goal

Once `work publish` has published a unit and deleted its work ref, no
other writer in the same clone puts that work ref back on the remote.

## why

On 2026-09-25 the work ref
`delendai/wip/claude-opus-5-5/q00024-S2-g1/a-corrupt-candidate-changes-nothing`
was created on the remote at 11:36:56 UTC, **during** the `work publish`
that published it (started 11:36:30, returned success at 11:36:58). No
later event deleted it. ref-lifecycle then failed on every open pull
request and on a certification run, until the ref was reaped by hand.
Two earlier reappearances that day had the same outcome.

This repository's policy has a `continuous` checkpoint cadence with
visible work refs, so the host runs the checkout publisher
(`work-checkout-publisher.service.ts`) every five minutes. It reads the
worktree listing, finds a checked-out work ref with its own commits that
the remote lacks, and pushes it by commit id. `work publish` pushes the
publication ref, removes the worktree, deletes the remote work ref and
then the local one. Both pushes go through the pre-push hook, which
takes tens of seconds. So a cadence push that looked while the ref was
still unpublished landed after publication had deleted it (publication
had found nothing to delete). Neither writer can see the other's push
while it is in flight, so a check before pushing cannot close the race.

## why this design

The two writers exclude each other with a per-work-ref lock file in the
git common directory. That directory is shared by every worktree of the
clone, and the writers are separate processes in separate worktrees.
The lock reuses core's existing TTL file mutex (`createStartupMutex`:
atomic `wx` create, takeover after the TTL) rather than adding a second
one.

- `work publish` holds the ref for its whole sequence. If the ref is
  busy, it waits a bounded time (one cadence push, pre-push hook
  included). If the ref is still busy after that, it refuses and
  publishes nothing.
- The checkout publisher holds the ref before reading it, and skips a
  ref it cannot hold. Every read happens under the lock, so a ref that
  a publication has just ended reads as gone and is not pushed.

Either the cadence push lands first and the publication deletes it, or
the publication ends first and the cadence push finds nothing to push.

## non-goals

- Changing what the checkout publisher pushes, or its cadence.
- Serialising checkpoints made through the work-ref tool. Those are an
  agent's own explicit writes, not a background process racing it.

## architecture

- `packages/core/src/lib/wip-engine/work-ref-lock.ts` (+ `.constant.ts`,
  `.interface.ts`): `holdWorkRef`, `workRefLockPath`. Only
  `holdWorkRef` is exported from `@delendai/core/public`, because it is the
  only one used outside core.
- `packages/cli/src/lib/work-publish.service.ts`:
  `publishWorkRefExclusively` wraps `publishWorkRef`. `work publish`
  calls the wrapper. Wait bounds are in
  `packages/cli/src/contracts/constants/work-publish.constant.ts`.
- `plugins/commit-policy/src/lib/services/work-checkout-publisher.service.ts`:
  each ref is published while held. A ref held elsewhere is skipped,
  with the holder named.

## Slices

- global_gate: none

### S1 — Publishing and the cadence push exclude each other

- **Status**: review
- **Gate**: `npx vitest run packages/core/tests/src/lib/wip-engine/work-ref-lock.spec.ts packages/cli/src/lib/work-publish.service.spec.ts plugins/commit-policy/tests/src/lib/services/work-checkout-publisher.service.spec.ts`
- **Files**:
  - `packages/core/src/lib/wip-engine/work-ref-lock.ts`
  - `packages/core/src/lib/wip-engine/work-ref-lock.constant.ts`
  - `packages/core/src/lib/wip-engine/work-ref-lock.interface.ts`
  - `packages/core/src/public/index.ts`
  - `packages/core/tests/src/lib/wip-engine/work-ref-lock.spec.ts`
  - `packages/cli/src/lib/work-publish.service.ts`
  - `packages/cli/src/lib/work-publish.service.spec.ts`
  - `packages/cli/src/contracts/constants/work-publish.constant.ts`
  - `packages/cli/src/commands/work.command.ts`
  - `plugins/commit-policy/src/lib/services/work-checkout-publisher.service.ts`
  - `plugins/commit-policy/tests/src/lib/services/work-checkout-publisher.service.spec.ts`
- review-state: in_review
- review-implementer: claude-opus-5-5
## dependency graph

None.

## acceptance

- While another process holds a work ref, `work publish` pushes nothing,
  and its refusal names the holder.
- `work publish` waits for a holder that releases, then publishes and
  releases the ref.
- The checkout publisher pushes nothing for a ref held elsewhere, and
  says who holds it.
- The checkout publisher reads a ref only once it holds it. A work ref
  deleted before the hold was granted is skipped, and it is not put
  back on the remote.

## risks and mitigations

- **A crashed holder.** The mutex is taken over after its TTL (ten
  minutes), which is longer than a publication through the pre-push
  hook. Until then, the cadence skips the ref and `work publish`
  refuses with the holder named.
- **Other clones.** The lock is per clone. A second clone publishing the
  same unit is a claim conflict, which the work claim already covers.

## notes

The GitHub event log (`repos/…/events`, `CreateEvent`/`DeleteEvent` on
`delendai/wip/*`) is where the 11:36:56 creation was read.
