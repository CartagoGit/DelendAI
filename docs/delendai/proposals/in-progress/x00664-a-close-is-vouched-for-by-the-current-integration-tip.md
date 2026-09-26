---
id: x00664
title: "A close is vouched for by the current integration tip"
kind: fix
status: in-progress
type: proposal
track: trust
date: 2026-09-26
priority: P1
related: [x00659, x00661]
---

# x00664 — A close is vouched for by the current integration tip

## goal

A proposal is closed on the strength of a certification only when that
certification is of the integration branch as it is now. A reviewer
told which later commits changed a slice also knows when that list is
incomplete, and the reviewer's progress shows on their work branch.

## why

An external audit of the review flow (2026-09-26) found three gaps.

1. x00659 accepted the newest certification entry whose commit contains
   the delivery. It did not check that the entry was still the current
   integration tip. Suppose develop certifies green at A, then B merges
   and turns it red while B's own certification is still running. A
   close in that window is vouched for by A, which is not the branch
   the proposal now lives on.
2. `changedSince` (x00661) lists at most 10 later commits and does not
   say when there are more. A reviewer reading 10 commits cannot tell
   that an eleventh reverted the slice.
3. Reviewers committed only at the end, so their work branch looked
   empty from the integration branch until the pull request appeared.

## why this design

- **The certification must be of the tip.** The evidence is used only
  when the newest certification entry is `certified` and its commit
  equals `refs/remotes/origin/<integration>` now. When the tip cannot
  be read, there is no evidence, and the close falls back to a local
  validate, as before x00659.
- **Fetch one more than is shown.** `changedSince` asks git for 11
  commits, lists 10, and sets `changedSinceTruncated` when the eleventh
  exists. It adds no extra query.
- **Commit after each verdict.** The served procedure tells reviewers to
  commit in their claimed worktree after every verdict, and to publish
  once when the round is done.
- The bootstrap rule "never re-read a file you just wrote or re-run a
  check that passed" becomes "while nothing has changed since". The
  audit read the absolute form as forbidding re-verification after a
  change.

## non-goals

- Serialising closes behind certification runs.
- Paginating `changedSince`.

## architecture

- `plugins/proposals/src/lib/services/integration-certification-evidence.service.ts`:
  `integrationTip` input.
- `plugins/proposals/src/lib/tools/proposal-transition.tool.ts`:
  resolves the tip.
- `plugins/proposals/src/lib/services/review-changed-since.service.ts`,
  `review-queue.service.ts`: the truncation flag.
- `plugins/proposals/src/lib/services/review-procedure.ts`: commit
  cadence.

## Slices

- global_gate: none

### S1 — Tip-bound certification, truncation flag, reviewer commit cadence

- **Status**: in-progress
- **Gate**: `npx vitest run plugins/proposals/tests/src/lib/services/integration-certification-evidence.service.spec.ts plugins/proposals/tests/src/lib/tools/proposal-transition.tool.spec.ts plugins/proposals/tests/src/lib/tools/review-queue.tool.spec.ts`
- **Files**:
  - `plugins/proposals/src/lib/services/integration-certification-evidence.service.ts`
  - `plugins/proposals/src/lib/tools/proposal-transition.tool.ts`
  - `plugins/proposals/src/lib/services/review-changed-since.service.ts`
  - `plugins/proposals/src/lib/services/review-queue.service.ts`
  - `plugins/proposals/src/lib/services/review-procedure.ts`
  - `plugins/proposals/src/lib/contracts/constants/review-queue-schema.constant.ts`
  - `plugins/proposals/src/lib/contracts/interfaces/review-queue.interface.ts`
  - `docs/delendai/AGENT-BOOTSTRAP.md`
  - `plugins/proposals/tests/src/lib/services/integration-certification-evidence.service.spec.ts`
  - `plugins/proposals/tests/src/lib/tools/proposal-transition.tool.spec.ts`
  - `plugins/proposals/tests/src/lib/tools/review-queue.tool.spec.ts`

## dependency graph

None.

## acceptance

- A certification of an earlier commit than the current integration tip
  does not vouch for a close, even when it contains the delivery.
- With the tip unreadable, no certification vouches.
- A slice changed by more than 10 later commits lists 10 and reports
  `changedSinceTruncated: true`; a shorter list omits the flag.
- The served procedure tells reviewers to commit after each verdict.
