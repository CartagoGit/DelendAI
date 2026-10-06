---
id: f00643
title: "The startup forge and journal phases run in a real host"
kind: feat
status: in-progress
type: proposal
track: trust
date: 2026-09-26
last-transition-id: 3e9f6faf-bbca-4f3a-8518-7d1d13153075
last-correlation-id: 3e9f6faf-bbca-4f3a-8518-7d1d13153075
last-transition-from: ready
---

# f00643 — The startup forge and journal phases run in a real host

## Goal

A host boot runs the startup reconciler's forge phase against the real forge, and its journal phase against a real journal source, instead of reporting both NOT EXECUTED on every boot.

## why

Every MCP boot logs `phases NOT EXECUTED: forge, journal` (seen again on 2026-09-26). The report is honest: `runStartupGate` has no input for either collaborator, and the only implementations of `IStartupForgeSeam` and `IStartupJournalSource` are test fakes. The phases themselves (`reconcile-forge.ts`, `import-journal.ts`) are built and specified: the first mirrors pull requests and check runs with conditional reads (ETag), and the second replays coordination events that git and the forge cannot re-derive. So a fresh machine rebuilds its state database without the forge's view of merges and checks, and without the meaning of past recoveries and hand-overs. No proposal tracked the gap.

## non-goals

- Any write to the forge: the phase is read-only by design.
- Choosing where the journal ships without the maintainer: it is the one input a rebuild cannot re-derive, so its home (a ref, a release asset, a bucket) is a policy decision. (Decided 2026-10-06 under the maintainer's delegation; see S2.)

## Slices

- global_gate: none

### S1 — A read-only forge seam is bound in the host
- **Status**: review
- **Files**: `packages/core/src/lib/startup-gate/run-startup-gate.ts`, `packages/core/src/lib/startup-gate/run-startup-gate.interface.ts`, `packages/core/src/cli.ts`, `packages/core/tests/src/lib/startup-gate/run-startup-gate.spec.ts`, `packages/core/tests/src/lib/startup-reconciler/idempotency.spec.ts`, `tools/scripts/host/forge-seam.service.ts`, `tools/scripts/host/forge-seam.interface.ts`, `tools/scripts/host/forge-seam.constant.ts`, `tools/scripts/host/forge-seam.service.spec.ts`, `tools/scripts/host/host-server.script.ts`
- **Gate**: `npx vitest run --project core packages/core/tests/src/lib/startup-gate/run-startup-gate.spec.ts packages/core/tests/src/lib/startup-reconciler/idempotency.spec.ts && npx vitest run --project tools tools/scripts/host/forge-seam.service.spec.ts`
- acceptance:
  - "`runStartupGate` accepts a forge seam and passes it to the reconciler; the forge phase is no longer listed NOT EXECUTED when one is bound."
  - "The host binds a seam that lists pull requests and check runs through the forge's API with the previous ETag, and answers `unavailable` (never throws) without credentials or network."
  - "A warm boot with nothing changed costs one conditional request and writes no rows."
  - shipped: `runStartupGate` takes an optional `forge` seam and stops listing the phase NOT EXECUTED when bound; the host seam (`forge-seam.service.ts`) shells out to the user's own `gh` session with `If-None-Match`, maps pull requests and check runs, and answers `unavailable` instead of throwing; a warm boot costs one conditional request and writes no rows.
- review-state: in_review
- review-implementer: claude-sonnet-5-5

### S2 — A journal source is bound once its home is decided
- **Status**: pending
- **DependsOn**: [S1]
- **Files**: `packages/core/src/lib/startup-reconciler/seams.interface.ts`
- **Gate**: type
- **Decision 2026-10-06** (the maintainer delegated it: decide autonomously, agnostic of host, forge and runtime): the coordination journal ships as a **git ref on the project's own remote**, `refs/<namespace>/journal`, one commit per published batch whose tree holds append-only NDJSON (one `IJournalSourceEvent` per line, ordered by `occurredAt`). Why a ref: it is the one home every project already has and every git host serves; a release asset or a bucket ties the journal to one forge or vendor, and needs credentials a clone does not have. It is how retired tips are kept already (`refs/<namespace>/retired/*`), so a fresh clone recovers both the same way (`git fetch origin refs/<namespace>/journal`). Hidden from branch listings, never merged into the integration branch, and readable without the forge's API.
- This slice is the read side: the host binds an `IStartupJournalSource` that fetches the ref and reads its events since `sinceOccurredAt`; an absent ref is an empty journal, an unreachable remote is `unavailable`. Publishing to the ref is an outward write with its own failure modes, so it is S3.
- acceptance:
  - "The maintainer's decision on where the coordination journal ships is recorded in this proposal."
  - "The host binds an `IStartupJournalSource` reading from there, and replaying the same events twice imports them once."

### S3 — The journal is published to its ref
- **Status**: pending
- **DependsOn**: [S2]
- **Files**: `tools/scripts/host/host-server.script.ts`
- **Gate**: type
- acceptance:
  - "Events the state database appends are published to `refs/<namespace>/journal` as a fast-forward commit; a rejected push (another machine published first) fetches, merges by event identity, and retries, so no event is lost and none is duplicated."
  - "A publication failure never fails the work that produced the event: it is reported, and the next boot publishes what is pending."

## acceptance

- `runStartupGate` accepts a forge seam and passes it to the reconciler; the forge phase is no longer listed NOT EXECUTED when one is bound.
- The host binds a seam that lists pull requests and check runs through the forge's API with the previous ETag, and answers `unavailable` (never throws) without credentials or network.
- A warm boot with nothing changed costs one conditional request and writes no rows.
- The maintainer's decision on where the coordination journal ships is recorded in this proposal.
- The host binds an `IStartupJournalSource` reading from there, and replaying the same events twice imports them once.
