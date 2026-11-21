---
id: x01119
title: "Two work deliver runs on one unit cannot overlap: deliver takes a per-unit lock and names the running deliver"
kind: fix
status: review
type: proposal
track: general
date: 2026-11-21
last-transition-id: d8c836a8-609f-41ec-985b-fba20b1b538d
last-correlation-id: d8c836a8-609f-41ec-985b-fba20b1b538d
last-transition-from: in-progress
last-transition-at: 2026-11-21T11:11:58.294Z
---

# x01119 — Two work deliver runs on one unit cannot overlap: deliver takes a per-unit lock and names the running deliver

## goal

A second `delendai work deliver` on a unit that is already being delivered refuses at once and names the running deliver's pid, so the two never race on the unit's git index.

## why

Seen on x01117: two concurrent `work deliver` runs on the same unit overlapped and one failed on a git index.lock held by the other. Nothing in packages/cli/src/lib/work-deliver.service.ts serialises deliveries of one unit: runDelivery transitions, proves, commits and publishes with no exclusion. Root cause hypothesis: the unit lease guards entering a unit, not running deliver in it, so a retry or a second agent starts a second pipeline whose git writes collide. Checked docs/delendai/proposals: no proposal covers a per-unit deliver lock (x01076 and x01093 concern what a re-delivery publishes and prints, not exclusion).

## non-goals

- Locking other work commands
- Changing the shared compute slot of the proof

## slices

- global_gate: none

### S1 — Deliver holds a per-unit lock and refuses a second run naming the first
- **Status**: review
- **Files**: `packages/cli/src/lib/work-deliver.service.ts`, `new:packages/cli/src/lib/work-deliver-lock.service.ts`, `new:packages/cli/src/lib/work-deliver-lock.service.spec.ts`, `packages/cli/src/lib/work-deliver.service.spec.ts`
- **Gate**: type
- **Decisions**: none
- acceptance:
  - "work-deliver-lock.service.spec.ts: a second acquire on the same unit while the first holder's pid is alive is refused with an error naming that pid; a lock whose pid is dead is taken over."
  - "work-deliver.service.spec.ts: deliverUnit run twice concurrently on one unit lets one proceed and answers the other with the refusal naming the running pid, and releases the lock when the delivery ends in success or failure."
- shipped-in: `1d6e69e53067`
- review-state: in_review
- review-implementer: claude-sonnet-5-5

## acceptance

- work-deliver-lock.service.spec.ts: a second acquire on the same unit while the first holder's pid is alive is refused with an error naming that pid; a lock whose pid is dead is taken over.
- work-deliver.service.spec.ts: deliverUnit run twice concurrently on one unit lets one proceed and answers the other with the refusal naming the running pid, and releases the lock when the delivery ends in success or failure.
