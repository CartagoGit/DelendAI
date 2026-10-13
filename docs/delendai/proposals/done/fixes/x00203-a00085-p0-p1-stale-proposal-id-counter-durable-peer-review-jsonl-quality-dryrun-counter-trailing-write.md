---
id: x00203
title: "a00085 P0/P1: stale proposal-id counter, durable peer-review JSONL, quality dryRun, counter trailing write"
kind: fix
status: done
type: proposal
track: plugins+fix
date: 2026-08-23
shipped-in: [5fcfdd59b]
related:
  - a00085
acceptance:
  - { command: bun run test -- plugins/proposals/tests/src/lib/proposals/proposal-id-allocator.spec.ts plugins/proposals/tests/src/lib/shared/peer-review-log.spec.ts plugins/quality/tests/src/lib/quality.spec.ts, expect: exit0 }
  - { command: bun run lint:proposals, expect: exit0 }
last-transition-id: 48c1589f-3ca1-4744-94d5-5bbcd15fc2c7
last-correlation-id: 48c1589f-3ca1-4744-94d5-5bbcd15fc2c7
last-transition-from: review
---

# x00203 — a00085 P0/P1: allocator, counters, peer-review JSONL, quality dryRun

## Goal

Close the four highest-severity a00085 findings that are safe to ship without waiting on a separate allocator merge:

1. **FATAL** `allocateNextProposalId` reissues ids when the counter JSON exists and lags disk (reproduced: `create_proposal` reissued `a00084`).
2. **BAD** `sync-proposal-counters` follows `writeFileAtomic` with a bare `writeFile`.
3. **BAD** peer-review JSONL uses unprotected `appendFile` (two writers).
4. **BAD** `run_quality` `dryRun` still executes commands.

## why

a00085 scored correctness 4/10 on these exact gaps. The allocator bug already produced duplicate ids in the wild (`r00005`) and again in this session (`a00084`). Shipping the four together unblocks spawning further follow-ups without colliding ids.

## non-goals

- HMAC spend-token binding (`a00085` #5) — separate slice, orchestrator-runner.
- Notification watcher `prev` reset, stdio connect teardown, scaffold `outputSchema`.
- NFD kebab / i18n / dashboard schema (MINOR).

## Slices

- global_gate: lint

### S1 — Allocator consults disk on every allocate
- **Status**: done
- **Files**: `plugins/proposals/src/lib/proposals/proposal-id-allocator.ts`, `plugins/proposals/tests/src/lib/proposals/proposal-id-allocator.spec.ts`
- **Gate**: lint
- acceptance:
  - "stale counter `{ r: 4 }` + on-disk `r00005` allocates `r00006`"
  - "counter ahead of disk still wins"
  - "prefixes reconcile independently"
- review-state: done
- review-implementer: proposal_guardian
- review-reviewer: delivery_verifier
- review-log: approved by delivery_verifier
### S2 — Drop trailing bare writeFile in sync-proposal-counters
- **Status**: done
- **Files**: `tools/scripts/proposals/sync-proposal-counters.script.ts`
- **Gate**: none
- acceptance:
  - "script persists only via persistCounters (withFileMutex + writeFileAtomic)"
- review-state: done
- review-implementer: proposal_guardian
- review-reviewer: delivery_verifier
- review-log: approved by delivery_verifier
### S3 — Durable peer-review JSONL writer
- **Status**: done
- **Files**: `plugins/proposals/src/lib/shared/peer-review-log.ts`, `plugins/proposals/src/lib/tools/authoring.tool.ts`, `plugins/proposals/tests/src/lib/shared/peer-review-log.spec.ts`
- **Gate**: lint
- acceptance:
  - "appendPeerReviewJsonl uses withFileMutex + handle.sync"
  - "authoring.tool routes through the shared helper"
- review-state: done
- review-implementer: proposal_guardian
- review-reviewer: delivery_verifier
- review-log: approved by delivery_verifier
### S4 — run_quality dryRun does not spawn
- **Status**: done
- **Files**: `plugins/quality/src/index.ts`, `plugins/quality/tests/src/lib/quality.spec.ts`
- **Gate**: lint
- acceptance:
  - "dryRun:true returns { ok, dryRun, commands } and does not call runScope"
- review-state: done
- review-implementer: proposal_guardian
- review-reviewer: delivery_verifier
- review-log: approved by delivery_verifier
## acceptance

- Allocator stale-counter regressions pass.
- Peer-review append is mutex + fsync.
- `sync-proposal-counters` has no trailing `writeFile`.
- `run_quality { dryRun: true }` lists commands without spawning.
