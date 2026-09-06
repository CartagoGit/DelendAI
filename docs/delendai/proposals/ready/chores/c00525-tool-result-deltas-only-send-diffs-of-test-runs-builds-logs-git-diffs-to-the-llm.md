---
id: c00525
title: "Tool-result deltas: only send diffs of test runs, builds, logs, git diffs to the LLM"
kind: plan
status: ready
type: proposal
track: efficiency
date: 2026-09-06
priority: P1
related:
    - c00522 # Context Compiler — receives the deltas as `changed` and `evidence` refs
    - c00523 # ArtifactStore — the deltas live in the CAS, only the diff travels to the model
    - c00524 # ReconciliationEngine — produces the deltas as part of the plan
    - c00521 # benchmark hardening — measures the savings
---

# c00525 — Tool-result deltas: only send diffs of test runs, builds, logs, git diffs to the LLM

## Goal

The user's briefing lists "Tool-result deltas" as a high-impact
optimisation:

> If you run tests and 800 lines come out, the CAS saves 800. The
> model receives:
>
> ```
> test-run:t91
> 506 passed
> 2 failed
> new failures:
> - generation.spec.ts:217 ...
> - reconciliation.spec.ts:93 ...
> ```
>
> If you run them again:
>
> ```
> test-run:t92
> delta from t91:
> - generation.spec.ts fixed
> - reconciliation.spec.ts still failing
> ```
>
> The same 800 lines are not re-sent.

This proposal introduces a **`IDeltaSurface`** primitive that every
high-traffic tool can opt into. The tool's raw output is written
to the `ArtifactStore` (c00523) under a content-addressed ref; the
LLM-facing payload is a small delta against the previous ref.

```ts
interface IDeltaSurface<T> {
  record(toolName: string, payload: T): Promise<{ ref: ArtifactRef; delta: TDelta<T> }>;
  delta(ref: ArtifactRef): Promise<{ ref: ArtifactRef; delta: TDelta<T> }>;
  resolve(ref: ArtifactRef): Promise<T>;
}

interface TDelta<T> {
  readonly added?: Partial<T>;
  readonly removed?: readonly string[];
  readonly changed?: readonly { path: string; before: unknown; after: unknown }[];
  readonly summary: string;     // human-readable, ~50 tokens
  readonly ref: ArtifactRef;   // pointer to the full payload
}
```

The LLM receives the `summary` (cheap). On demand, it calls
`resolve(ref)` (or the Context Compiler's `expand(ref, 'source')`)
to fetch the full payload.

## why

The user's briefing lists this as "puede ahorrar cantidades
absurdas de contexto". The current `bun run validate` payload,
for example, returns every spec's full output. If the suite has
100 tests and 2 fail, the model gets 100 lines plus the failure
diagnostic — most of which is **identical to last time**. Sending
the delta instead collapses to ~10 tokens plus the failure
diagnostic.

The same applies to `git diff`, `git_log`, `git_status`,
`logs_query`, and any other tool whose output is large but
incremental.

## why this design

The CAS pattern means the deltas are **free to compute**: the
delta is `added = newLines \ oldLines` and
`removed = oldLines \ newLines`. The CAS already dedupes; the
delta is just the diff.

The model never loses information: when it needs the full
payload, it calls `expand()`. The CAS ref is in the response, so
the LLM can ask for it.

The delta shape is intentionally minimal: `summary` is a
precomputed human-readable string (~50 tokens), `added` /
`removed` / `changed` are structured fields the model can
pattern-match without parsing prose, and `ref` is the pointer.
The model can also send the structured fields back to a tool
(`act_on_delta({ ref, action: 'fix' })`) if a future proposal
adds that.

## Tasks

### S1 — The primitive

`packages/core/src/lib/shared/delta-surface.ts`:

- `createDeltaSurface(toolName, options)` returns an
  `IDeltaSurface<T>`.
- `record(payload)` writes the payload to the local filesystem CAS
  (`.cache/delendai/deltas/<hash>`) and computes the delta against
  the previous record. Returns `{ ref, delta }`.
- `resolve(ref)` reads the payload back.
- The previous-ref is tracked per-tool in a small JSONL file
  (`.cache/delendai/deltas/<toolName>.prev.jsonl`).

### S2 — Adopt in the high-traffic tools

- `tools/scripts/run-validation.script.ts` (or its split-up
  per-stage versions) — wrap the `bun run validate` output in a
  DeltaSurface. The LLM-facing payload is the delta + a
  precomputed summary.
- `plugins/git/src/lib/tools/git-diff.tool.ts` —
  `record(diffText)`. The delta shows added/removed hunks; the
  summary lists file names.
- `plugins/git/src/lib/tools/git-log.tool.ts` —
  `record(commits[])`. The delta shows new commits; the summary
  is "N new commits since <prevRef>".
- `plugins/logs/src/lib/services/log-store.ts` —
  `record(events[])`. The delta shows new events; the summary
  groups by `incidentType`.

### S3 — Wire into the compact router

`packages/core/src/lib/tools/compact-router.tool.ts` adds:

- A new tool annotation `effects: ['delta']` (or a flag in the
  tool registration) that tells the router to wrap the response in
  a DeltaSurface payload.

(Phase 0: the wrapper is opt-in per tool. The router does not
enforce it; it just surfaces the wrapper.)

### S4 — Tests

- `packages/core/tests/src/lib/shared/delta-surface.spec.ts` —
  round-trip; deltas across two records; `resolve()` returns the
  full payload.
- `tools/scripts/run-validation-deltas.spec.ts` —
  integration: the validate output is wrapped, the delta is
  computed, the LLM-facing summary is the right shape.

### S5 — Token-budget dashboard

`docs/delendai/TOKEN-BUDGETS.md` adds rows for the high-traffic
tools showing the **delta size** vs the **full payload size** —
the saving is the headline number.

## Acceptance

- `IDeltaSurface` exists and is exported.
- The four high-traffic tools (validate, git-diff, git-log,
  logs_query) wrap their output in the delta surface.
- The benchmark in c00521 shows the savings.
- `bun run validate` stays green.

## Out of scope

- Delta compression (gzip / xz). The CAS already dedupes; the
  delta is the diff. Compression would add CPU cost for token
  savings that gzip / base64 do NOT preserve anyway (per the
  briefing).
- Cross-tool deltas (e.g. "this validate failure corresponds to
  this git commit"). Future addition.