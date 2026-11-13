---
id: x01050
title: "The maintenance lease can be taken by two servers at once"
kind: fix
status: ready
type: proposal
track: general
date: 2026-11-08
---

# x01050 — The maintenance lease can be taken by two servers at once

## goal

Two servers racing for an absent maintenance lease end with exactly one holder, by construction and not by luck.

## why

The spec 'ends a race on an absent lease with one holder' (packages/core/tests/src/lib/development-policy/maintenance-lease.service.spec.ts) turned develop red. The cause is in hold() of packages/core/src/lib/development-policy/maintenance-lease.service.ts, found by reading, not yet reproduced under a debugger: hold() reads the record once to learn whether it is live (held) and a second time (judged) to decide whether it is free. When contender A links the lease between those two reads, contender B saw no record at the first read, so it never checks liveness, then reads A's fresh record as judged, treats it as 'unreadable or stale', and removeIfStill() moves A's live lease aside, finds it equals judged, deletes it and returns true. B then take()s the lease and both return true. The x01020 fix closed the remove-then-create window but left this one, because liveness is judged on the first read and removal on the second.

## non-goals

- Do not make the spec tolerant: it asserts the right invariant.
- Not part of c00537, which only removes clocks from specs.

## slices

- global_gate: none

### S1 — Judge liveness on the record that is removed
- **Status**: pending
- **Files**: `packages/core/src/lib/development-policy/maintenance-lease.service.ts`, `packages/core/tests/src/lib/development-policy/maintenance-lease.service.spec.ts`
- **Gate**: none
- acceptance:
  - "hold() removes a record only after parsing the exact text it is about to remove and finding it not live; a live record read at the second look makes hold() return false"
  - "A spec forces the interleaving (record created between the two reads) with an injected read seam and fails before the fix"
  - "The existing 25-round race spec stays and passes"

## acceptance

- hold() removes a record only after parsing the exact text it is about to remove and finding it not live; a live record read at the second look makes hold() return false
- A spec forces the interleaving (record created between the two reads) with an injected read seam and fails before the fix
- The existing 25-round race spec stays and passes
