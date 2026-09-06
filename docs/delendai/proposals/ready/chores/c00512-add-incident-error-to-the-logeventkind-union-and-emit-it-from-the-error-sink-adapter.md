---
id: c00512
title: "Add `'incident-error'` to the `LogEventKind` union and emit it from the error-sink-adapter"
kind: chore
status: ready
type: proposal
track: observability
date: 2026-09-06
priority: P1
related:
    - c00510 # the parent hardening round
    - c00511 # wire `withErrorCollection` so the new kind has actual producers
---

# c00512 — Add `'incident-error'` to the `LogEventKind` union

## Goal

The error-sink-adapter (in
`plugins/logs/src/lib/services/error-sink-adapter.ts:12`) **docs**
the new kind `'incident-error'` as "the only existing `LogEventKind`
that covers peer-emitted incidents", but the actual
`LogEventKind` union in
`plugins/logs/src/lib/services/kinds.ts:110` does not declare it.
The adapter therefore has to cast and emit `kind: 'log-warning'`
instead, with the meaning packed into `incidentType`.

This proposal closes the documentation-vs-code drift so a model that
pattern-matches the documented `'incident-error'` actually sees
peer-emitted events.

## why

The audit (H4 / P1) called this out specifically: the doc lies about
the contract. Models that look for `'incident-error'` from the skill
description miss every event. The fix is mechanical: add the symbol
to the union and emit it from the adapter.

## why this design

The kind is the unit cost — a single string addition to a discriminated
union. The downstream consumers (logs query, notification bridge)
already filter by `kind`, so they pick up the new kind automatically.
The `incidentType` field already carries the semantic meaning; no
schema change is required.

## Tasks

### S1 — Union update

Add `'incident-error'` to the `LogEventKind` discriminated union in
`plugins/logs/src/lib/services/kinds.ts:110`.

### S2 — Adapter update

In `plugins/logs/src/lib/services/error-sink-adapter.ts:60`, change
the emitted `kind` from `'log-warning'` to `'incident-error'` and
remove the cast. Keep `incidentType` and `severity` as the
discriminator pair (the same shape `plugin/logs` already emits for
peer-detected incidents via the watcher).

### S3 — Documentation sync

- Update the skill `plugins/logs/skills/*/SKILL.md` to describe
  `'incident-error'` as the canonical kind for peer-emitted errors.
- Update `error-sink-adapter.ts:12` to drop the "not yet in the
  union" caveat.

### S4 — Test coverage

Add a spec for `error-sink-adapter` that pins the emitted
`kind: 'incident-error'` shape, so a future refactor cannot
silently regress to `'log-warning'`.

## Acceptance

- `LogEventKind` includes `'incident-error'`.
- `error-sink-adapter.ts` emits `kind: 'incident-error'` (not via
  cast) for every captured error.
- The new spec exits 0.
- `bun run validate` stays green.

## Out of scope

- Migrating `console.warn` peer-review / plan-closure logs into the
  sink — see c00513.
- Auto-wiring the sink via `withErrorCollection` — see c00511.