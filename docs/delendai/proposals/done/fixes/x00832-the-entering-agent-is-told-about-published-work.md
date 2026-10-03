---
id: x00832
title: "The entering agent is told about published work"
kind: fix
status: done
type: proposal
track: trust
date: 2026-10-01
priority: P2
related: [x00555, x00791, x00831]
last-transition-id: 6543b0d6-0020-48b8-879b-648de2121a47
last-correlation-id: 6543b0d6-0020-48b8-879b-648de2121a47
last-transition-from: review
shipped-in:
  - "1f4460bde27fc69a2d5cb3c02245a2e960cfc78d"
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
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: MiniMaxM3
- review-log: approved by MiniMaxM3 — x00832 S1 delivered at 1f4460bde27f: work-briefing.service.ts now lists other agents' unlanded publications alongside live work refs; publications marked 'waiting to land'. 5/5 tests green in work-briefing.service.spec.ts.
- review-attribution: claude-opus-5-5 from Merge pull request #728 from CartagoGit/delendai/pr/claude-opus-5-5/implement/x00832-all-g1/the-briefing-shows-published-work (refs/heads/delendai/wip/claude-opus-5-5/implement/x00832-all-g1/the-briefing-shows-published-work) (1f4460bde27fc69a2d5cb3c02245a2e960cfc78d), opened by MiniMaxM3

## dependency graph

None.

## acceptance

- Another agent's unlanded publication appears in the briefing marked as
  published; a landed one and the entering agent's own do not.
