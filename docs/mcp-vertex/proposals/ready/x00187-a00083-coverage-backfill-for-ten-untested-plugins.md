---
id: x00187
title: "a00083 — coverage backfill: 10 plugins ship with 0 specs, persistent-task-queue needs a parallel-writer test"
kind: fix
status: ready
type: proposal
track: tests+audit-followup
date: 2026-07-29
related:
    - a00083 # full-project audit
---

# x00187 — a00083 — coverage backfill: 10 plugins ship with 0 specs, persistent-task-queue needs a parallel-writer test

## Goal

Resolve findings F30, F31, F32 from a00083 (29-07-2026). 10 plugins ship with 0 spec files (~16 kLOC total), 3 workspaces (`packages/cli`, `apps/shared`, `tools`) have no specs, and `persistent-task-queue` (853 LOC) has no parallel-writer test even though every other concurrent engine in `plugins/proposals` does.

This proposal lands the first batch of specs — one happy-path + one failure-path per untested plugin — and the parallel-writer test that closes the concurrency-table gap surfaced in the audit's Phase 8.

## why

- **F31 (10 plugins at 0 specs)** — `api` (3780 LOC, OpenAPI spec parse + dispatch), `browser` (2111, WebSocket driver), `container` (2665, `docker build` wrapper), `database` (3173, DB introspection), `prompt-eval` (1218, prompt scoring), `auto-plugin-selector`, `changelog`, `prompts-pack`, `skills-pack`, `refactor` (2868, the worst-scoring slice; `x00184` covers the contract gaps, this proposal covers its spec baseline). All touch parsing, external execution, or contract validation — exactly the classes the audit brief flags as under-tested.
- **F30 (persistent-task-queue parallel)** — the audit's concurrency table marks this scenario as the **only ❌** in the whole proposals plugin. Every other engine has its parallel-writer test; this one is missing.
- **F32 (workspaces without specs)** — `packages/cli` ships as a published npm package, `apps/shared` is shared code, `tools` is the tooling monorepo.

## non-goals

- Reaching a target coverage percentage. This proposal lands the **first** spec per untested plugin; the second batch (deeper coverage) is a separate follow-up.
- Replacing existing tests. This proposal only adds missing tests.

## slices

### S1 — concurrent-engine parallel-writer spec
- **Status**: ready
- **Files**: <see slice body below>
- **Gate**: test
  acceptance:

- **File**: `plugins/proposals/tests/src/lib/agents/persistent-task-queue.spec.ts`.
- Add a `it('serializes concurrent enqueue + observe under contention', ...)` that fires `N=8` concurrent `enqueue` calls against the same persisted queue and asserts the final queue length matches the unique payloads (no lost updates).
- Reference the existing parallel specs (`sync-proposal-registry-race.spec.ts#L88`, `agent-lock-engine.spec.ts#L573`) for the contention pattern.

### S2 — first specs for the 10 zero-spec plugins
- **Status**: ready
- **Files**: <see slice body below>
- **Gate**: test
  acceptance:

- One happy-path + one failure-path per plugin. Specifically:
  - `plugins/api/tests/` — parse a small OpenAPI 3.1 fixture; assert request build.
  - `plugins/browser/tests/` — assert the WS driver handshake contract.
  - `plugins/container/tests/` — assert `container_inspect` returns the `skipped` envelope when `docker` is absent (no subprocess spawned).
  - `plugins/database/tests/` — assert `db_probe` returns `{ ok: false, installHint: … }` when the driver is missing.
  - `plugins/prompt-eval/tests/` — assert the scorer rejects an empty dataset.
  - `plugins/auto-plugin-selector/tests/` — assert the recommendation contract shape.
  - `plugins/changelog/tests/` — assert the changelog tool returns the typed envelope.
  - `plugins/prompts-pack/tests/` — assert pack render is deterministic.
  - `plugins/skills-pack/tests/` — assert skills enumeration is order-stable.
  - `plugins/refactor/tests/` — see `x00184` s2.

### S3 — workspace baselines
- **Status**: ready
- **Files**: <see slice body below>
- **Gate**: test
  acceptance:

- `packages/cli/tests/` — at least one smoke spec asserting the published CLI runs.
- `apps/shared/tests/` — at least one spec per public helper.
- `tools/tests/` — at least one spec covering the verify:tools harness (mirrors the manual run).

## Notes



- a00083 — full-project audit
- x00184 — refactor plugin contract (separate slice; this proposal covers refactor's spec baseline only)

## acceptance

Every slice lands with its acceptance bullets green and `bun run validate` exits 0 on a clean checkout of develop (the gate itself ships in x00189 s4).
