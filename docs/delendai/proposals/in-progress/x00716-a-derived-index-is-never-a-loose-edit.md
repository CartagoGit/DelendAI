---
id: x00716
title: "Asking for work never needs a sync first"
kind: fix
status: in-progress
type: proposal
track: trust
date: 2026-09-28
priority: P0
related: [x00638, x00686]
---

# x00716 — Asking for work never needs a sync first

## goal

`auto_work` answers from the proposal files, wherever the agent asks
from, and changes no tracked file to do so.

## why

Driven from a consumer repository's shared checkout on 2026-09-28,
`auto_work` answered "Run sync_proposals: the index is behind the
proposals on disk", and `sync_proposals` then refused: "this call would
write into the shared checkout on develop". Every agent that starts in
the shared checkout, on any host, is stuck between those two answers,
and improvises. The index is derived from the files, which are the
source of truth. Rebuilding it is not a change anyone must commit.
`sync_proposals` also archives, renames, moves and unblocks proposal
files, and those are tracked changes. Its refusal in the shared checkout
is right, so sending a reader of the proposals there is the mistake.

## why this design

- **`auto_work` rebuilds its own index.** When the proposal files
  outnumber the entries, it rebuilds, then chooses. No step is left to
  the agent.
- **Index only.** The sync engine gains `indexOnly`, which rebuilds the
  index and its projection and skips the four reconciliations that move
  files. `sync_proposals` keeps doing all of it, and stays refused in the
  shared checkout.
- **One engine.** The refresh is `runSyncProposals` with the plugin's own
  sync options, shared by `auto_work` and `continue_proposal`.

## non-goals

- Relocating misplaced proposals from the shared checkout.

## architecture

- `plugins/proposals/src/lib/proposals/sync-proposal-registry.ts`: `indexOnly`.
- `plugins/proposals/src/lib/tools/sync-proposals.tool.ts`: passes it through.
- `plugins/proposals/src/lib/tools/continue-proposal.tool.ts`: `refreshIndex`, `freshEntries`.
- `plugins/proposals/src/index.ts`: one `syncOptions`, one `refreshIndex`.

## Slices

- global_gate: none

### S1 — Work is found from anywhere

- **Status**: in-progress
- **Gate**: `npx vitest run plugins/proposals/tests/src/lib/continue-proposal.spec.ts plugins/proposals/tests/src/lib/proposals/sync-proposal-registry-kind.spec.ts`
- **Files**:
  - `plugins/proposals/src/lib/proposals/sync-proposal-registry.ts`
  - `plugins/proposals/src/lib/tools/sync-proposals.tool.ts`
  - `plugins/proposals/src/lib/tools/continue-proposal.tool.ts`
  - `plugins/proposals/src/index.ts`
  - `plugins/proposals/tests/src/lib/continue-proposal.spec.ts`
  - `plugins/proposals/tests/src/lib/proposals/sync-proposal-registry-kind.spec.ts`

## dependency graph

None.

## acceptance

- From a consumer repository's shared checkout with no index,
  `auto_work` hands out `claim x00009` and leaves no tracked change.
  Before, it answered "Run sync_proposals", and the sync was refused.
- An index-only sync indexes a misplaced proposal and moves nothing.
