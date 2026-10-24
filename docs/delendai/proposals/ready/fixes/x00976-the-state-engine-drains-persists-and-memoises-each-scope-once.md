---
id: x00976
title: "The state engine drains, persists and memoises each scope once"
kind: fix
status: ready
type: proposal
track: a00095-consistency
date: 2026-10-24
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
- **Status**: pending
- **Files**: `packages/state-telemetry/src/lib/events/work-event-journal-drain.service.ts`, `packages/state-telemetry/src/lib/eta/duration-journal.service.ts`
- **Gate**: type
- acceptance:
  - "A claim records its owner pid and a second drain does not take a live claim (STATE01)."
  - "A sink failure keeps the journal for retry (STATE02)."
  - "An abandoned duration is closed, not overwritten (STATE03)."

### S2 — Coordination and memo
- **Status**: pending
- **Files**: `packages/state-sqlite/src/lib/coordination-store.ts`, `packages/state/src/lib/memo-derivation-engine.service.ts`
- **Gate**: type
- acceptance:
  - "Coordination reads from the database on each operation; two instances see each other's writes (STATE04)."
  - "The memo key includes the scope (STATE05)."

### S3 — Parity and coverage in required checks
- **Status**: pending
- **Files**: `.github/workflows/tier3.yml`, `.github/branch-protection.yml`, `packages/state/src/lib/driver-in-memory.ts`, `packages/contracts/src/state.ts`, `tools/scripts/lint/state-engine-coverage.script.ts`
- **Gate**: type
- acceptance:
  - "Driver parity runs in a required check (G111)."
  - "Every IStateRegistry method has a spec and the coverage lint fails when one is missing (G112)."

## acceptance

- A claim records its owner pid and a second drain does not take a live claim (STATE01).
- A sink failure keeps the journal for retry (STATE02).
- An abandoned duration is closed, not overwritten (STATE03).
- Coordination reads from the database on each operation; two instances see each other's writes (STATE04).
- The memo key includes the scope (STATE05).
- Driver parity runs in a required check (G111).
- Every IStateRegistry method has a spec and the coverage lint fails when one is missing (G112).
