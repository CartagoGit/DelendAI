---
id: c00521
title: "Harden the token-budget benchmark with `isError` / `structuredContent` / payload-shape assertions"
kind: chore
status: ready
type: proposal
track: efficiency
date: 2026-09-06
priority: P2
related:
    - c00510 # parent hardening round
    - tools/scripts/measure/catalog-task-context-cost.ts # the benchmark this proposal hardens
    - docs/delendai/TOKEN-BUDGETS.md # the dashboard whose numbers the benchmark feeds
---

# c00521 — Harden the token-budget benchmark with shape assertions

## Goal

The current `catalog-task-context-cost` benchmark measures the
**byte size** of the `delendai_compact_router { domain: "core",
action: "project_context" }` response in four states (cold start,
after `search.search`, after `docs.docs_list`, after `logs.tail`)
and reports a flat ~55 bytes / 14 tokens for every state. The
2026-09-06 post-commit review (c00510 retro, §13) flagged this as
**suspicious**:

> The router envelope alone carries `{ routed, domain, action,
> tool, active, isError, text / structuredContent }`. For the
> payload to be a useful 14 tokens in four states, the underlying
> `IProjectContextSnapshot` would have to compress to almost
> nothing — but the snapshot must contain `surfaceMode`,
> `loadedPlugins`, `visibleToolCount`, `hiddenToolCount`,
> `visibleDomains` and other fields.

The benchmark does NOT assert `isError === false`, does NOT assert
`structuredContent` is populated, and does NOT assert the
`project_context` action resolved correctly. If the router is
silently returning a degraded result (e.g. an empty placeholder),
the benchmark reports "14 tokens saved" but the agent loses real
context.

This proposal adds the missing assertions.

## why

The user explicitly listed "eficiencia sin perder rendimiento ni
perder realmente el objetivo de un agente" as a requirement.
Optimising tokens at the cost of silently dropping context is
**exactly the failure mode to avoid**. The benchmark is the gate
that catches the regression.

## why this design

Hardening the benchmark in place (rather than introducing a new
one) keeps the surface area small. The new assertions use the same
measurement infrastructure (`measureToolResultBytes`) plus a
post-`isError`/`structuredContent`/payload-shape check. A failed
assertion makes the measurement exit 1, not just print a smaller
number.

The benchmark is a **measurement script**, not a test in the
strict sense. The proposal keeps it as a measurement (it still
emits the dashboard values) but adds a **structural validation
mode** that refuses to publish the dashboard if the routed payload
is broken.

## Tasks

### S1 — Assert the envelope

`tools/scripts/measure/catalog-task-context-cost.ts`:

- After `measureToolResultBytes(client, 'delendai_compact_router',
  PROJECT_CONTEXT_ROUTE)`, fetch the raw response and assert:
  - `result.isError !== true`.
  - `result.structuredContent !== undefined`.
  - `result.structuredContent.routed === true`.
  - `result.structuredContent.action === 'project_context'`.

A failed assertion exits 1 with a clear message ("the routed
payload is broken; token measurement is unsafe to publish").

### S2 — Assert the inner snapshot

When `result.structuredContent.structuredContent` is present (the
router unwraps the inner tool's `structuredContent`), assert it
contains the minimum required fields:

- `surfaceMode` (one of `'native'` / `'managed'` / `'adaptive'`
  / `'compact'`).
- `loadedPlugins` (array of plugin ids).
- `visibleToolCount` (number ≥ 1).
- `hiddenToolCount` (number ≥ 0).

If any field is missing, the measurement exits 1. The benchmark
is then authoritative: a "14 tokens" number implies the agent
will see a real `IProjectContextSnapshot`, not an empty stub.

### S3 — Fix the underlying bug (if any)

If the assertions in S1 / S2 fail on the current code, the
measurement is unsound and the underlying routed payload is
broken. That is the regression the audit implicitly suspected.
Two possible root causes:

- The router returns an empty `text` because the inner tool
  throws and the catch path produces an empty body.
- The router is suppressing the inner tool's `structuredContent`
  because the surface mode is `compact` and the projection
  elides it.

The fix lives in the routed tool's response builder, not in this
proposal. This proposal exposes the regression; a follow-up
proposal fixes the projection.

### S4 — Document the gate

`docs/delendai/TOKEN-BUDGETS.md`:

- Note that the dashboard's numbers are only authoritative when
  the benchmark exits 0.
- Note the new shape assertions.

## Acceptance

- The benchmark exits 1 if `result.isError === true` or if the
  inner snapshot is missing required fields.
- The benchmark's `cold start` / `after search` / `after docs` /
  `after logs` measurements either all pass the new assertions
  (genuine 14-token savings are real) or fail (the underlying bug
  is surfaced for a follow-up fix).
- `bun run validate` stays green.

## Out of scope

- Fixing any underlying projection bug found by S3. That is a
  separate proposal; this one only surfaces the regression.
- Optimising the snapshot further. The point of this slice is
  honesty, not speed.