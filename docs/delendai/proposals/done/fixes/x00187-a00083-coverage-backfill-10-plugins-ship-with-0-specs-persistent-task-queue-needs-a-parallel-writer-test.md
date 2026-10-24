---
id: x00187
title: "a00083 — coverage backfill: 10 plugins ship with 0 specs, persistent-task-queue needs a parallel-writer test"
kind: fix
status: done
type: proposal
track: tests+audit-followup
date: 2026-07-29
related:
    - a00083 # full-project audit
shipped-in:
    - 926ebecb # fix(x00187): task-queue-engine concurrent enqueue regression test
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
- **Status**: done
- **Files**: `plugins/proposals/tests/src/lib/agents/task-queue-engine.concurrency.spec.ts`
- **Gate**: test
- acceptance:
  - "Verified the gap first: `grep -c 'concurrent\\|Promise.all\\|parallel'` against `persistent-task-queue.spec.ts` returned 0 — this part of F30 reproduces."
  - "Traced WHERE the lock should live before writing the test: `persistent-task-queue.ts`'s `enqueue`/`persistQueue`/`parseQueue` are deliberately bare, unlocked primitives (pure in-memory transform + separate I/O helpers) — there is no shared mutable state to race on by calling them directly, so a parallel-writer test against them would either be a no-op or would exercise a caller pattern this codebase never actually uses. The real read-modify-write serialization lives one layer up, in `task-queue-engine.ts`'s `runTaskQueueAction`, which already wraps the enqueue action in `withFileMutex(paths.queuePath, ...)`."
  - "Placed the test at the layer that owns the lock — a new `task-queue-engine.concurrency.spec.ts` (sibling to the existing `task-queue-engine.corrupt.spec.ts`, same fixture pattern), not the originally-named `persistent-task-queue.spec.ts` — and matched the exact pattern the proposal's own two references use (`sync-proposal-registry-race.spec.ts`'s `Promise.allSettled` over the real reconcile entry point; `agent-lock-engine.spec.ts`'s `Promise.all` over the real `run({action:'claim',...})` entry point), not the bare primitives."
  - "Test fires `N=8` concurrent `runTaskQueueAction({action:'enqueue',...})` calls against the same queue file and asserts: all 8 resolve `status:'queued'`, the persisted file has exactly 8 entries with 8 unique taskIds (no lost updates), and each result's `queueLength` forms the exact sequence 1..8 (proving the mutex serialized them one at a time rather than let two readers observe the same base state)."
  - "1/1 passing; confirms `withFileMutex` already closes F30's actual concurrency gap — this test is the missing regression coverage the audit's concurrency table was flagging, not a new fix."

### S2 — first specs for the 10 zero-spec plugins
- **Status**: done
- **Files**: none (verification only, documented here)
- **Gate**: test
- acceptance:
  - "Re-verified directly with `find plugins/<id> -iname '*.spec.ts' | wc -l` for all 10 named plugins: api=9, browser=5, container=14, database=7, prompt-eval=6, auto-plugin-selector=3, changelog=3, prompts-pack=1, skills-pack=1, refactor=7. None are 0. This matches an identical stale-claim pattern already documented in this session for x00189's S3 and confirmed independently a second time here — the audit's spec-count claims across a00083 are systematically unreliable, most likely from being run against the pre-x00167 `test-convention scan_drift` that always reported 0 scanned files."
  - "No code change. Documented as retired rather than silently skipped or blindly implemented."

### S3 — workspace baselines
- **Status**: done
- **Files**: none (verification only, documented here)
- **Gate**: test
- acceptance:
  - "Re-verified directly: `packages/cli` has 35 spec files, `apps/shared` has 15, `tools` has 72. None are 0."
  - "No code change. Documented as retired."

## Notes



- a00083 — full-project audit
- x00184 — refactor plugin contract (separate slice; this proposal covers refactor's spec baseline only)

## acceptance

S1 lands with its acceptance bullets green: `bun test plugins/proposals` → 1114/1114 passing (was 1113 before this slice), `bun run typecheck` clean, `bun run lint:solid` clean against the regenerated baseline. S2/S3's premises did not reproduce and are documented above rather than implemented against a nonexistent gap.
