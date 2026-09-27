---
id: x00660
title: "Reviewers work as a swarm"
kind: fix
status: review
type: proposal
track: trust
date: 2026-09-26
priority: P0
related: [x00646, x00653, x00659]
last-transition-id: 9b32a134-af0e-4db0-9d1a-37212bd1ecd1
last-correlation-id: 9b32a134-af0e-4db0-9d1a-37212bd1ecd1
last-transition-from: in-progress
---

# x00660 — Reviewers work as a swarm

## goal

Several reviewers review at the same time. Each takes a proposal nobody
else is reviewing and records verdicts that every other reviewer, and
the agent who closes the proposal, can see.

## why

On 2026-09-26 two reviewers (qwen, GLM) ran against the same backlog:

- `review_queue` gave both the same oldest proposals. They collided
  entering `f00394-close`, and one of them waited on the other's lock on
  the same proposal file (`lock contention … held past 5000ms by a live
  holder`).
- Reviewing canonically, in a worktree passed as `checkout` (x00653), put
  the **peer-review journal inside the reviewer's worktree**. It is a
  `.cache` file that is deleted with the worktree. The agent closing the
  proposal reads the journal of its own checkout. There it found nothing,
  or an older round's verdict, and the close was refused while the
  approval sat in a directory nobody else reads.

## why this design

- **The claim is the unit of work.** `delendai work enter
  --proposal=<id> --slice=review` creates the reviewer's work ref and
  worktree, and only one agent can hold a unit, so no lock store is
  needed. `review_queue` reads every review unit (`review`, or `close`
  from before there was one name): local, remote-tracking, work refs,
  and publications mapped back to their work ref, all decoded with the
  project's own template. Each proposal says who holds it (`claimedBy`)
  or how to claim it (`claim`). Proposals held by others are listed
  last, so a swarm spreads over the backlog. A published review still
  holds its proposal until the pull request merges, because its verdicts
  are not on the integration branch yet. The caller passes `agent`, and
  its own claims do not count against it.
- **One journal per repository.** The peer-review journal is a log of
  verdicts. Like the other logs it belongs to the repository, not the
  checkout: it is out of the paths that follow the caller, and
  `proposal_review` writes it in the shared checkout whichever worktree
  it runs in.
- **The procedure says it.** Claim before reading, pass the worktree as
  `checkout`, commit there, publish, and take the next proposal if the
  claim is refused.

## non-goals

- Claims across machines. On one machine, a unit's worktree path makes
  the claim exclusive. Two machines claiming the same proposal would
  both see each other only after fetching.
- The machine-wide compute lock that serializes heavy gates. It protects
  the machine and slows a large swarm, but it does not block it.

## architecture

- `plugins/proposals/src/lib/services/review-claims.service.ts`,
  `contracts/constants/review-claims.constant.ts`: who holds what.
- `plugins/proposals/src/lib/services/review-queue.service.ts` (+ schema,
  interface, tool): `agent`, `claimedBy`, `claim`, `claimedByOthers`, the
  ordering, and the procedure.
- `plugins/proposals/src/lib/services/scope-to-caller.service.ts`,
  `tools/authoring.tool.ts`, `tools/proposal-transition.tool.ts`: the
  journal stays repository-level.
- `packages/cli/src/commands/groups/proposals.ts`: `review-queue
  --agent`.

## Slices

- global_gate: none

### S1 — Reviewers claim, and share one journal

- **Status**: review
- **Gate**: `npx vitest run plugins/proposals/tests/src/lib/tools/review-queue.tool.spec.ts plugins/proposals/tests/src/lib/tools/proposal-review-attribution.spec.ts packages/cli/src/commands/groups/proposals.spec.ts`
- **Files**:
  - `plugins/proposals/src/lib/services/review-claims.service.ts`
  - `plugins/proposals/src/lib/contracts/constants/review-claims.constant.ts`
  - `plugins/proposals/src/lib/services/review-queue.service.ts`
  - `plugins/proposals/src/lib/contracts/constants/review-queue-schema.constant.ts`
  - `plugins/proposals/src/lib/contracts/interfaces/review-queue.interface.ts`
  - `plugins/proposals/src/lib/tools/review-queue.tool.ts`
  - `plugins/proposals/src/lib/services/scope-to-caller.service.ts`
  - `plugins/proposals/src/lib/tools/authoring.tool.ts`
  - `plugins/proposals/src/lib/tools/proposal-transition.tool.ts`
  - `plugins/proposals/src/generated/tool-outputs.ts`
  - `packages/cli/src/commands/groups/proposals.ts`
  - `packages/cli/src/commands/groups/proposals.spec.ts`
  - `plugins/proposals/tests/src/lib/tools/review-queue.tool.spec.ts`
  - `plugins/proposals/tests/src/lib/tools/proposal-review-attribution.spec.ts`
- review-state: in_review
- review-implementer: claude-opus-5-5
## dependency graph

None.

## acceptance

- A proposal another reviewer holds is listed last with `claimedBy`; the
  others carry a `claim` command naming the caller.
- A reviewer's own claim does not count against it.
- A published review holds its proposal until it merges.
- An implementation unit is not a review claim.
- A verdict recorded from a reviewer's worktree lands in the
  repository's journal, and nothing is written inside the worktree.
- Measured on the live repository (2026-09-26): for `glm-5.3-max`, f00394
  (held by qwen) is out of the first page, and f00418 (GLM's own) is
  listed with the rest.
