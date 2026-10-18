---
id: f00767
title: "What an account has left is observed, not assumed"
kind: feat
status: ready
type: proposal
track: batuta
date: 2026-10-19
parent: q00034
---

# f00767 — What an account has left is observed, not assumed

## goal

Every hop on an account leaves a dated observation of what its quota groups have left, written by one writer in the shape the reservation reads, and a person may declare a budget per account in their personal file; with either, unattended hops run within it and the runner says what remained when it chose. This is q00034 S3.

## why

The reservation (`plugins/orchestrator-runner/src/lib/services/quota-reservation.service.ts`, `quotaHoldFor`) refuses a hop unless the quota snapshot holds a fresh observation for each of the account's groups (`snapshot.groups[group]`). Nothing ever writes `groups`:

- `quota.ts` has a writer (`writeQuotaSnapshot`, `mergeQuotaSources`, `buildQuotaSnapshot`), keyed by provider rather than by group, and no production code calls any of the three;
- the API invoker parses rate-limit headers into a sample on every response and hands it to `options.quotaSink` (`subprocess/api.ts:122-129`), which nothing wires, so the sample is dropped;
- a CLI hop (a subscription login) produces no observation at all.

So every unattended hop on an account with quota groups is refused — the safe outcome, and the reason Batuta has never run with a real account (f00551 S7).

## non-goals

- Guessing a limit a vendor does not state: an unknown limit stays unknown, and only a declared budget stands in for it.

## slices

- global_gate: type

### S1 — One writer of group observations

- **Status**: pending
- **Files**: `plugins/orchestrator-runner/src/lib/quota.ts`, `plugins/orchestrator-runner/src/lib/subprocess/api.ts`
- **Gate**: type
- acceptance:
  - "One writer records observations keyed by quota group, in the shape `quotaHoldFor` reads, under the snapshot's mutex: the API invoker's header sample is mapped to the groups of the hop's account and written (its `quotaSink` wired); a hop that fails on a vendor limit records the group as exhausted until the reset it names. The provider-keyed writer nobody calls is removed. A spec holds a header sample becoming a group observation and a 429 exhausting the group."

### S2 — A declared budget stands in for an unknown limit

- **Status**: pending
- **Files**: `packages/core/src/lib/contracts/constants/personal-layer-schema.constant.ts`, `plugins/orchestrator-runner/src/lib/services/quota-reservation.service.ts`
- **Gate**: type
- acceptance:
  - "The personal file may declare, per account, a budget per window (`requests` or `usd` per `hour`, `day`, `week` or `month`); the reservation counts the hops it reserved against it, and refuses once it is spent, naming the budget and the window. With neither an observation nor a budget, a hop is refused as today. Specs hold within budget, spent budget, and no budget."

### S3 — A choice says what remained

- **Status**: pending
- **Files**: `plugins/orchestrator-runner/src/lib/services/quota-reservation.service.ts`
- **Gate**: type
- acceptance:
  - "A reserved hop's journal entry records, per group, what remained (observed or budgeted, and which), so the learned store (q00034 S4) can weigh spend against outcome. A spec holds the entry."

## acceptance

- An account the owner declares with a budget runs an unattended hop, the journal says what it had left, and an account with neither budget nor observation is still refused.
