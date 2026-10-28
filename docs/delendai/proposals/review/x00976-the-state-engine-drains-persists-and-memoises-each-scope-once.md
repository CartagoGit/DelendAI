---
id: x00976
title: "The state engine drains, persists and memoises each scope once"
kind: fix
status: review
type: proposal
track: a00095-consistency
date: 2026-10-24
last-transition-id: 4843f75b-fcbe-40a8-b1e8-82614acfa17e
last-correlation-id: 4843f75b-fcbe-40a8-b1e8-82614acfa17e
last-transition-from: in-progress
last-transition-at: 2026-10-25T07:38:55.293Z
shipped-in:
  - "c373f00b0f40"
---

# x00976 — The state engine drains, persists and memoises each scope once

## goal

A claimed journal has one live consumer, a transient sink failure keeps the journal, abandoned durations are not overwritten, two SQLite instances share coordination state, the memo key includes the scope, the in-memory and SQLite drivers are proved equivalent in the required checks, and every registry method has a test.

## why

gpt-6.1-sol's contribution and a00095. G61-STATE01: two live drains consume the same claim. G61-STATE02: a transient sink failure retires the only journal. G61-STATE03: an abandoned duration is ignored and later overwritten. G61-STATE04: two SQLite instances keep an old coordination copy and overwrite each other. G61-STATE05: the derivation memo ignores scope in its key. G111: the only gate proving the SQLite driver equals the in-memory one never runs as a required check. G112: five IStateRegistry methods have no test, and the lint that detects it is calibrated not to.

## non-goals

- Replacing the SQLite driver or the telemetry journal format.

## slices

- global_gate: type

### S1 — Drain and durations
- **Status**: done
- **Files**: `packages/state-telemetry/src/lib/drain/journal-claim.helper.spec.ts`, `packages/state-telemetry/src/lib/drain/journal-claim.helper.ts`, `packages/state-telemetry/src/lib/drain/telemetry-drain.service.spec.ts`, `packages/state-telemetry/src/lib/eta/duration-journal.service.spec.ts`, `packages/state-telemetry/src/lib/eta/duration-journal.service.ts`, `packages/state-telemetry/src/lib/events/contracts/interfaces/work-event-journal-drain.interface.ts`, `packages/state-telemetry/src/lib/events/work-event-journal-drain.service.spec.ts`, `packages/state-telemetry/src/lib/events/work-event-journal-drain.service.ts`
- **Gate**: type
- acceptance:
  - "A claim records its owner pid and a second drain does not take a live claim (STATE01)."
  - "A sink failure keeps the journal for retry (STATE02)."
  - "An abandoned duration is closed, not overwritten (STATE03)."

- shipped-in: `c373f00b0f40`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3.1-flash-preview
- review-log: approved by minimax-m3.1-flash-preview — verified at c373f00b0f40, validate exit 0 and tests 24/24 claimed, no recorded run cited; acceptance 3/3: (1) journal-claim.helper.ts:50 puts the owner pid in the claim name and :56 skips a live owner's claim; journal-claim.helper.spec.ts ('takes the live journal under… (2) work-event-journal-drain.service.ts:78 pushes a refused raw line into the retained list and :81-82 appends it back to the live journal before the claim is remo… (3) duration-journal.service.ts:60 claims through claimJournal, so a leftover draining journal is recorded as an abandoned claim and the live journal is never rena… — Type gate ran once for the pack in the unit worktree: bun run typecheck exited 0. Slice specs: the state-telemetry drain and eta suites are green, exit 0.

### S2 — Coordination and memo
- **Status**: done
- **Files**: `packages/state-sqlite/src/lib/coordination-store.spec.ts`, `packages/state-sqlite/src/lib/sqlite-driver.ts`, `packages/state/src/lib/driver-in-memory.ts`, `packages/state/src/lib/memo-derivation-engine.service.ts`, `packages/state/tests/src/lib/memo-derivation-engine.spec.ts`
- **Gate**: type
- acceptance:
  - "Coordination reads from the database on each operation; two instances see each other's writes (STATE04)."
  - "The memo key includes the scope (STATE05)."

- shipped-in: `c373f00b0f40`
- review-state: in_review
- review-implementer: claude-opus-5-5

### S3 — Parity and coverage in required checks
- **Status**: done
- **Files**: `.github/workflows/ci.yml`, `packages/state-sqlite/src/lib/registry-contract.spec.ts`, `packages/state/tests/src/contract/registry-contract.helper.ts`, `packages/state/tests/src/contract/registry-methods-contract.helper.ts`, `packages/state/tests/src/registry.spec.ts`, `tools/scripts/ci/job-scope.constant.ts`, `tools/scripts/lint/state-engine-coverage.script.spec.ts`, `tools/scripts/lint/state-engine-coverage.script.ts`
- **Gate**: type
- acceptance:
  - "Driver parity runs in a required check (G111)."
  - "Every IStateRegistry method has a spec and the coverage lint fails when one is missing (G112)."
- shipped-in: `c373f00b0f40`
- review-state: in_review
- review-implementer: claude-opus-5-5

## acceptance

- A claim records its owner pid and a second drain does not take a live claim (STATE01).
- A sink failure keeps the journal for retry (STATE02).
- An abandoned duration is closed, not overwritten (STATE03).
- Coordination reads from the database on each operation; two instances see each other's writes (STATE04).
- The memo key includes the scope (STATE05).
- Driver parity runs in a required check (G111).
- Every IStateRegistry method has a spec and the coverage lint fails when one is missing (G112).

## notes

- STATE02: an event the sink refuses is appended back to the live journal (`retained` in the result), so the next drain retries it; lines that are not events are still skipped.
- STATE04: the SQLite driver runs each coordination operation (leases, swarm claims and their handles) inside one immediate transaction that first reads the stored coordination into the in-memory delegate (`syncCoordination`): counters move forward, swarm claims and the holders of known generations become the stored ones.
- G111: the parity sampler runs in `sqlite-cutover-ready`, whose verdict `delendai-validate` requires; the job now also runs when `packages/state/` or `tools/scripts/state/` change. Branch protection is unchanged, and tier3 keeps its larger sampled report.
- G112: the IStateRegistry method list is read from `packages/contracts/src/state.ts`, which is unchanged; `branch-protection.yml` is unchanged too, since the required check already exists.
