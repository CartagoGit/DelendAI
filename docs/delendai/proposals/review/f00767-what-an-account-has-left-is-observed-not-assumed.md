---
id: f00767
title: "What an account has left is observed, not assumed"
kind: feat
status: review
type: proposal
track: batuta
date: 2026-10-19
parent: q00034
last-transition-id: ae91131d-3322-4fce-b386-816f01496de9
last-correlation-id: ae91131d-3322-4fce-b386-816f01496de9
last-transition-from: in-progress
last-transition-at: 2026-10-18T23:33:25.165Z
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

- **Status**: review
- **Files**: `plugins/orchestrator-runner/src/lib/quota.ts`, `plugins/orchestrator-runner/src/lib/subprocess/api.ts`, `plugins/orchestrator-runner/src/lib/invoke/build-manager.ts`, `plugins/orchestrator-runner/src/index.ts`, `plugins/orchestrator-runner/tests/src/lib/quota.spec.ts`
- **Gate**: type
- acceptance:
  - "One writer records observations keyed by quota group, in the shape `quotaHoldFor` reads, under the snapshot's mutex: the API invoker's header sample is mapped to the groups of the hop's account and written (its `quotaSink` wired); a request the vendor refuses (429) records the group with no room until the reset it names. The provider-keyed writer, part of the plugin's public API, writes only its own keys and no longer drops the groups. A spec holds a header sample becoming a group observation, a 429 exhausting the group, and a sample for a provider on no account recorded nowhere."
- review-state: in_review
- review-implementer: claude-opus-5-5
- shipped-in: `7f018bb4db50`

### S2 — A declared budget stands in for an unknown limit

- **Status**: review
- **Files**: `packages/core/src/lib/contracts/constants/provider-entry-schema.constant.ts`, `packages/core/src/lib/contracts/interfaces/provider-account.interface.ts`, `packages/core/src/contracts/index.ts`, `plugins/orchestrator-runner/src/lib/services/quota-reservation.service.ts`, `plugins/orchestrator-runner/src/lib/contracts/interfaces/quota-reservation.interface.ts`, `plugins/orchestrator-runner/src/lib/contracts/constants/quota-window.constant.ts`, `plugins/orchestrator-runner/tests/src/lib/services/quota-reservation.service.spec.ts`
- **Gate**: type
- acceptance:
  - "An account may declare `budgets`, requests per quota window (`hourly`, `weekly`, `monthly`, the windows quota already uses), in the personal file or, when a team shares it, the shared one; the reservation counts the hops it reserved in each window (a ledger history, read as empty in a ledger written before it) and refuses once one is spent, naming the window. A stale observation is ignored where a budget stands in, so a 429 does not refuse every later hop. With neither an observation nor a budget, a hop is refused as today. Specs hold within budget, spent budget, a window that frees, a stale observation, no budget, and an old ledger. A budget in money waits for the cost each hop is measured at (q00034 S4)."
- review-state: in_review
- review-implementer: claude-opus-5-5
- shipped-in: `7f018bb4db50`

### S3 — A choice says what remained

- **Status**: review
- **Files**: `plugins/orchestrator-runner/src/lib/invoke/manager.ts`, `plugins/orchestrator-runner/src/lib/contracts/interfaces/invocation-journal.interface.ts`, `plugins/orchestrator-runner/tests/src/lib/invoke/manager-journal.spec.ts`
- **Gate**: type
- acceptance:
  - "A reserved hop's journal entry records, per group, what remained (observed or budgeted, and which), so the learned store (q00034 S4) can weigh spend against outcome. A spec holds the entry."
- review-state: in_review
- review-implementer: claude-opus-5-5
- shipped-in: `7f018bb4db50`

## acceptance

- An account the owner declares with a budget runs an unattended hop, the journal says what it had left, and an account with neither budget nor observation is still refused.
