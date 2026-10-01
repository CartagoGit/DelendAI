---
id: x00832
title: "The entering agent is told about published work"
kind: fix
status: review
type: proposal
track: trust
date: 2026-10-01
priority: P2
related: [x00555, x00791, x00831]
last-transition-id: 59b6ffc9-ad8b-497a-9a07-9be968e53f0f
last-correlation-id: 59b6ffc9-ad8b-497a-9a07-9be968e53f0f
last-transition-from: in-progress
---

# x00832 — The entering agent is told about published work

## goal

The briefing `work enter` hands an agent lists somebody else's
publications that have not landed, next to their live work refs.

## why

The briefing was built for a swarm whose work lived in work refs. Publishing
deletes the work ref, so a unit waiting in a pull request vanished from it:
an agent entering saw "nobody else" while a pull request about to change the
same files sat in the queue. x00791 gave the swarm view its publications;
the briefing never read them.

## why this design

- A publication counts while it has commits the integration branch lacks;
  a landed one is not news.
- Each briefed unit says whether it is published, and the text marks it
  "published, waiting to land", since its files change when it merges.

## non-goals

- Refusing anything: x00831 refuses a held slice; this only informs.

## Slices

- global_gate: none

### S1 — The briefing lists unlanded publications

- **Status**: done
- **Gate**: `npx vitest run packages/core/tests/src/lib/work-units/work-briefing.service.spec.ts`
- **Files**:
  - `packages/core/src/lib/contracts/interfaces/work-briefing.interface.ts`
  - `packages/core/src/lib/work-units/work-briefing.service.ts`
  - `packages/core/tests/src/lib/work-units/work-briefing.service.spec.ts`
- shipped-in: `1f4460bde27f`

## dependency graph

None.

## acceptance

- Another agent's unlanded publication appears in the briefing marked as
  published; a landed one and the entering agent's own do not.
