---
id: x00608
title: "A proposal tool writes where the server stands, not where the agent works"
kind: fix
status: review
type: proposal
track: trust
date: 2026-09-23
---

# x00608 — A proposal tool writes where the server stands, not where the agent works

## goal

A proposal write requested by an agent working in its own worktree must
land in that worktree. Today it lands in the MCP server's own workspace
root, which under the profiles this project ships is the shared checkout
pinned to the integration branch.

## why

Observed, not reasoned about. Working in
`.cache/delendai/.worktrees/x555s3` on a work ref, I called
`proposal_transition { id: "x00555", to: "review" }`. It answered `ok`
with `movedFrom: in-progress/…`, `movedTo: review/…`,
`indexSynced: true`. The move had happened — in the shared checkout at
the repository root, **on `develop`**, not in the worktree I was in:

```
RM docs/delendai/proposals/in-progress/x00555-….md -> docs/delendai/proposals/review/x00555-….md
```

`create_proposal` does the same: both new files for this fix were written
into the shared checkout and had to be carried over by hand.

Three things go wrong at once:

1. **The agent's branch never receives it.** The work the agent is doing
   is on its ref; the rename is somewhere else entirely. An agent that
   trusts the `ok` publishes a branch missing the transition, and the
   `proposal-ready-to-close` gate then refuses the push for a move the
   tool already said it had made.
2. **It stages a change on the integration branch**, which every profile
   here exists to prevent and which the guard then refuses to commit —
   correctly. The tool creates a state the project's own rules forbid.
3. **The index and the tree disagree.** `indexSynced: true` records
   `status: review` while the branch under work still has the file in
   `in-progress/`. That is the divergence x00601 was about, manufactured
   by the tool itself.

The report is not wrong about what it did; it is wrong about *where*, and
where is the whole question when several agents share one clone.

## why this design

The workspace root is resolved once, at server construction, from the
process that started it. That is right for a server and wrong for a
request: with a shared checkout plus per-agent worktrees — the model this
project recommends — the caller's checkout is routinely not the server's.

The fix is that a proposal write takes the checkout as part of the
request, defaulting to the server's root only when the caller does not
say. What the caller passes must be validated as a working tree of the
same repository (`git rev-parse --git-common-dir` agreeing), so a
mistyped path cannot make delendai write into an unrelated project — the
failure this proposal is trying to stop, not widen.

## non-goals

- Changing how the server resolves its own root for everything else.
- Making the shared checkout movable. It stays pinned; this is about not
  writing to it from elsewhere.

## Slices

- global_gate: none

### S1 — A proposal write says which checkout it is for

- **Status**: done
- **Gate**: `npx vitest run packages/core/tests/src/lib/shared/checkout-for-request.spec.ts`
- **Files**: `packages/core/src/lib/contracts/interfaces/shared-checkout.interface.ts`,
  `packages/core/src/lib/shared/shared-checkout.ts`,
  `packages/core/src/lib/contracts/constants/checkout-arg.constant.ts`,
  `packages/core/src/public/index.ts`,
  `packages/core/tests/src/lib/shared/checkout-for-request.spec.ts`,
  `plugins/proposals/src/lib/contracts/proposal-transition-input.contract.ts`,
  `plugins/proposals/src/lib/tools/proposal-transition.tool.ts`,
  `plugins/proposals/src/lib/tools/authoring.tool.ts`
- Both tools accept the calling agent's checkout and write there;
  omitting it keeps today's behaviour. A path that is not a working tree
  of this repository is refused, naming what was checked, rather than
  written to.
- The decision is not made twice. `checkoutForRequest` in
  `shared/shared-checkout.ts` — the module that already owns "which
  working copy is this" — answers it for both tools and for any tool
  that adopts it later, and `callerCheckout.arg` gives the argument one
  name and one description in the catalog. The whole concern is published
  under one name, `callerCheckout`: five separate exports would have been
  five things to take a copy of, and core's public surface has a ceiling
  for the same reason this module exists. Membership is proved the way
  that module already proves it: two working trees belong to one
  repository exactly when they share a git common directory. Comparing
  path prefixes would refuse the ordinary case, since a worktree may
  live anywhere on disk.
- `scopePathsToCheckout` moves the content tree and its per-tree
  derivatives (the proposals directory, the registry index, the
  peer-review journal) with the checkout. The id counter and the agent
  lock deliberately do not move: those are facts about the repository,
  and a per-worktree copy of either would hand out the same id twice or
  stop being a lock.

### S2 — A worktree agent gets the move it asked for

- **Status**: done — the spec was proved to be a tripwire: with the
  resolved checkout replaced by `undefined`, two of its three cases fail
  and the third (no checkout named) still passes.
- **Gate**: `npx vitest run plugins/proposals/tests/src/lib/tools/proposal-transition-checkout.spec.ts`
- **Files**: `plugins/proposals/tests/src/lib/tools/proposal-transition-checkout.spec.ts`
- Driven against a real repository with a shared checkout and a second
  worktree on a work ref: a transition requested for the worktree leaves
  the shared checkout untouched (`git status` clean there) and the rename
  present in the worktree, with the index agreeing with the tree the
  caller can see.

## acceptance

- The shared checkout is clean after a transition requested from a
  worktree, and the rename is in the worktree.
- A checkout path outside the repository is refused, not written to.
- Omitting the checkout behaves exactly as today, so nothing that calls
  these tools from the server's own root changes.
