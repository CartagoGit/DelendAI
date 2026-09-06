---
id: c00513
title: "Move peer-review and plan-closure bypass events from `console.warn` to `ctx.logs.log`"
kind: chore
status: ready
type: proposal
track: observability
date: 2026-09-06
priority: P1
related:
    - c00510 # the parent hardening round
    - c00511 # wire the sink first so the bypass events have a destination
    - c00512 # add `'incident-error'` kind so the new logs are typed
---

# c00513 — Move peer-review and plan-closure bypass events from `console.warn` to `ctx.logs.log`

## Goal

Two bypass paths in the proposals plugin currently write only to
stderr:

- **`plugins/proposals/src/lib/shared/peer-review-bypass-log.ts:73`**
  — peer-review bypass, with operator-supplied `reason` text.
- **`plugins/proposals/src/lib/shared/plan-closure-bypass-log.ts:72`**
  — plan-closure bypass, same shape.

Both have a `reason` field populated by operator free-text — which
can carry secrets. Both write via `console.warn` and nothing else.

This proposal moves both to `ctx.logs.log({
  severity: 'warning',
  incidentType: 'peer-review-bypass' | 'plan-closure-bypass',
  message: redactSecrets(reason).text,
  context: { proposalId, sliceId, agent },
})` so the event is structured, queryable, and secret-redacted.

## why

The audit (H6 / P1) flagged this as a governance hole: a peer-review
bypass leaves no JSONL footprint. An auditor asking "who bypassed
peer review last month?" can only grep CI logs. The free-text reason
can also carry tokens or other secrets that bypass-log users have
typed in. Both problems are solved by routing through the existing
`ctx.logs.log` channel.

## why this design

The proposal stays inside the existing
 `peer-review-bypass-log.ts` / `plan-closure-bypass-log.ts` files so
 the bypass **policy** stays near the
 **mechanism**. The files become thin wrappers around `ctx.logs.log`
 + `redactSecrets` rather than free-form `console.warn` emitters.

## Tasks

### S1 — Inject the sink

Both bypass helpers currently take a `reason: string` parameter.
Change the signature to take an `IErrorSink` (or `ctx.logs.log`-)
` callable, plumbed from the call site (the `proposal_review` and
`proposals_close_plan` tools already have `ctx` in scope).

### S2 — redactSecrets on the reason

Wrap `reason` through `redactSecrets` (from
`@delendai/core/public`) before emitting. The existing
`HIGH_CONFIDENCE_SECRET_PATTERNS` in `redact.ts` covers the common
shapes (GitHub PATs, AWS keys, JWT, etc.). Custom shapes can be
added in a follow-up.

### S3 — Structured emit

Replace the `console.warn(...)` call with:

```ts
sink.emit({
  kind: 'incident-error',
  severity: 'warning',
  incidentType: 'peer-review-bypass', // or 'plan-closure-bypass'
  message: redactSecrets(reason).text,
  context: { proposalId, sliceId, agent },
});
```

`kind: 'incident-error'` lands in the union via c00512.

### S4 — Tests

Add a spec for each bypass helper that asserts:

- The structured shape is emitted.
- The `reason` is redacted (a fixture with a fake `ghp_*` PAT
  produces `***REDACTED***` in the emitted message).
- No `console.warn` was called.

The existing `console.warn` calls in the rest of the proposals
plugin (the commit-policy instrumenter, the recovery tools, the
reaper) are NOT migrated in this proposal — they are part of a
follow-up audit that should be performed alongside the
`withErrorCollection` wiring (c00511).

## Acceptance

- Both bypass helpers emit a structured event with
  `kind: 'incident-error'`.
- `reason` is redacted via `redactSecrets` before emission.
- A `console.warn` lint rule catches the migration regression (a
  follow-up script that flags any new `console.warn` call in
  `plugins/proposals/src/lib/shared/*-bypass-log.ts`).
- `bun run validate` stays green.

## Out of scope

- Migrating the rest of the `console.warn` sites in the proposals
  plugin. That is a follow-up audit pass scheduled alongside
  c00511 (auto-wiring `withErrorCollection` will surface them
  automatically).