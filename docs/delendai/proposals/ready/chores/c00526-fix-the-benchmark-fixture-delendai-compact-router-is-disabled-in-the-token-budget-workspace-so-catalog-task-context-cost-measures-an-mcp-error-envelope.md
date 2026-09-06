---
id: c00526
title: "Fix the benchmark fixture — `delendai_compact_router` is disabled in the token-budget workspace, so `catalog-task-context-cost` measures an MCP error envelope"
kind: chore
status: ready
type: proposal
track: efficiency
date: 2026-09-06
priority: P1
related:
    - c00521 # the assert that surfaced this issue
    - c00522 # Context Compiler — depends on benchmark readings
    - tools/scripts/measure/catalog-task-context-cost.script.ts # the benchmark
    - tools/scripts/report/token-budget-report-lib.ts # the fixture workspace
---

# c00526 — Fix the benchmark fixture (compact_router disabled)

## Goal

`tools/scripts/measure/catalog-task-context-cost.script.ts` measures the
router envelope four times (cold start, after `search.search`, after
`docs.docs_list`, after `logs.tail`). The c00521 assert (now landed,
advisory by default) reveals that **every one of those four calls
returns `isError=true` with no `structuredContent`**:

```
⚠ c00521 (advisory): project_context envelope degraded at step "cold start"
   — isError=true hasStructured=false.
```

The underlying MCP response is:

```json
{
  "content": [{ "type": "text", "text": "MCP error -32602: Tool delendai_compact_router disabled" }],
  "isError": true
}
```

So the benchmark is measuring the byte size of an error message — ~55
bytes / 14 tokens — and reporting it as the "compact_router" cost. The
real byte count is invisible until the fixture is fixed.

## why

The token-budget dashboard (`docs/delendai/TOKEN-BUDGETS.md`) feeds on
this benchmark. Numbers like "14 tokens for project_context" are not a
saving; they are an artifact of a broken fixture. Until the fixture
allows `delendai_compact_router`, the dashboard values are
uninformative. The c00521 assert correctly refuses to certify the
measurement; the fix is to make the measurement meaningful.

## why this design

The minimum-viable fix is to either (a) explicitly enable the router
in the fixture workspace, or (b) drive the benchmark through a route
that is enabled in the fixture's preset. Option (a) is cleaner because
the benchmark's whole purpose is to measure the router; routing it
through a different tool would defeat the benchmark.

## Tasks

### S1 — Diagnose the fixture's access policy

`tools/scripts/report/token-budget-report-lib.ts#createTokenBudgetFixtureWorkspace`
creates the fixture. Investigate why `delendai_compact_router` lands
in the `disabled` access state under `swarm + managed`. Most likely
the fixture disables a tool class (e.g. router-only or surface-only)
to keep the surface reproducible; we need to make compact_router an
exception.

### S2 — Enable compact_router in the fixture

Add the router to the fixture's `enabled` set, OR adjust the
`accessPolicy` so the router is the one tool that stays accessible
in the `managed` surface mode (where the router is intended to be
the entry point).

### S3 — Re-run the benchmark with `--strict-envelope`

`bun tools/scripts/measure/catalog-task-context-cost.script.ts --strict-envelope`
should now exit 0 and report the real byte counts. The dashboard
values for `core.project_context via compact_router` should reflect
actual payload sizes, not error text.

### S4 — Pin the dashboard update

If the new byte counts differ from the previously reported ~55 bytes
(they almost certainly will), update `docs/delendai/TOKEN-BUDGETS.md`
and the auto-generated dashboard artifact
(`build/docs-api/.../token-budget-dashboard.*`) with the real numbers.

## Acceptance

- `bun tools/scripts/measure/catalog-task-context-cost.script.ts --strict-envelope`
  exits 0.
- The four `cold start / after search / after docs / after logs`
  samples report real payload sizes (kilobytes, not 55 bytes).
- The dashboard reflects the new numbers.
- The c00521 advisory warnings no longer fire.

## Risks and mitigations

- **Risk:** enabling the router in the fixture changes the fixture's
  surface size enough to invalidate other benchmarks that depend on
  the same workspace. **Mitigation:** S2 isolates the change to a
  single tool; if other benchmarks regress, the change is reverted
  and the benchmark is moved to a dedicated router-only fixture.
- **Risk:** the real byte counts are larger than the previously
  reported "savings", and the dashboard regresses. **Mitigation:**
  the dashboard is a measurement, not a budget; larger numbers
  prompt S4 to refresh the budget, not the fixture.
