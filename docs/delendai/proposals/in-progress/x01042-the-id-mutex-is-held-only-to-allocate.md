---
id: x01042
title: "The id mutex is held only to allocate"
kind: fix
status: in-progress
type: proposal
track: general
date: 2026-11-07
last-transition-id: d3a04991-1953-42a3-b44e-f7502239998b
last-correlation-id: d3a04991-1953-42a3-b44e-f7502239998b
last-transition-from: ready
last-transition-at: 2026-11-07T10:29:13.503Z
---

# x01042 — The id mutex is held only to allocate

## goal

The proposal-id mutex guards only the read-increment-write of the counters. Directory scans, git reads and the remote reservation run outside it, so a slow allocation never blocks another one.

## why

On 2026-11-07 create_proposal failed twice with `lock contention: proposal-id-counters.json.mutex held past 5000ms by a live holder`. A `__serve` host server (pid 2777566, claude-sonnet-5-5's new-all-g3 unit) had held the mutex for more than 4 minutes. `allocateNextProposalId` held it for the whole allocation: the scan of the proposals tree, `sources.elsewhere()` (`git worktree list`, one `ls-tree` per remote-tracking ref, an `ls-remote` of the reservations), and up to 50 `sources.reserve()` calls, each a `commit-tree`, a `send-pack` to the forge, an `ls-remote` and the release of superseded reservations. A slow forge kept every other allocation in the clone waiting until it failed. Only the counter needs the mutex: within the clone, two sessions get different numbers from it. The remote reservation is what separates clones, and it does that outside any local lock.

## non-goals

- Changing the id format, the reservation refs or the sources an id is seen in.

## slices

- global_gate: none

### S1 — The critical section is the counter alone
- **Status**: pending
- **Files**: `plugins/proposals/src/lib/proposals/proposal-id-allocator.ts`, `plugins/proposals/tests/src/lib/proposals/proposal-id-allocator.spec.ts`
- **Gate**: none
- acceptance:
  - "allocateNextProposalId holds the counter mutex only to read the counters, take the next number and write it back; the disk scan, sources.elsewhere() and sources.reserve() run outside it."
  - "A spec keeps one allocation's remote claim pending and shows that a concurrent allocation finishes with a different id instead of failing on lock contention; on the old allocator the same spec fails with LockContentionError."
  - "A taken reservation still moves on to the next id, and 50 taken ids still end in a refusal."

## acceptance

- allocateNextProposalId holds the counter mutex only to read the counters, take the next number and write it back; the disk scan, sources.elsewhere() and sources.reserve() run outside it.
- A spec keeps one allocation's remote claim pending and shows that a concurrent allocation finishes with a different id instead of failing on lock contention; on the old allocator the same spec fails with LockContentionError.
- A taken reservation still moves on to the next id, and 50 taken ids still end in a refusal.
