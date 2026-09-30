---
id: x00764
title: "A long file name can be written atomically"
kind: fix
status: review
type: proposal
track: trust
date: 2026-09-30
priority: P1
related: [q00010]
last-transition-id: 2c9bdc2b-172d-4242-b6e4-8406ee8b6028
last-correlation-id: 2c9bdc2b-172d-4242-b6e4-8406ee8b6028
last-transition-from: in-progress
---

# x00764 — A long file name can be written atomically

## goal

`writeFileAtomic` writes any file the file system can hold, whatever the
length of its name.

## why

On 2026-09-30 an agent could not move q00010 to review:
`transition-proposal` failed with `ENAMETOOLONG`. The proposal's file name
is 242 bytes (proposal files are named after their title), and the atomic
writer named its temporary `<name>.<time36>-<12 hex>.tmp`, about 26 bytes
more — past the 255-byte limit most file systems put on one name. Every
tool that rewrites a proposal goes through that writer, so any proposal
with a title that long could never change status again, and the only
remedies left were hand edits the governance refuses.

## why this design

- The temporary keeps the target's own name whenever the result fits; only
  a name that would not fit is shortened: its start, cut on a character
  boundary, plus 12 hex characters of a hash of the whole name, so two long
  names that share a start never share temporaries.
- The sweep of orphaned temporaries derives its prefix from the same
  function, so it keeps finding what the writer leaves.

## non-goals

- Shortening proposal file names: the name is the proposal's, and a
  filesystem limit is the writer's to respect.

## Slices

- global_gate: none

### S1 — The temporary's name fits the file system

- **Status**: done
- **Gate**: `npx vitest run packages/core/tests/src/lib/shared/atomic-write.spec.ts`
- **Files**:
  - `packages/core/src/lib/shared/atomic-write.ts`
  - `packages/core/tests/src/lib/shared/atomic-write.spec.ts`
- shipped-in: `7dc72fffb95b`

## dependency graph

None.

## acceptance

- A 242-byte file name is written by `writeFileAtomic` and
  `writeFileAtomicSync`, and leaves no temporary behind.
- Short names produce exactly the temporaries they did before.
- q00010 can be moved to review with `transition-proposal`.
