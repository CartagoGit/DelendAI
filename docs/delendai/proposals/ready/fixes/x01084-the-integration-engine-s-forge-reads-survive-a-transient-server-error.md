---
id: x01084
title: "The integration engine's forge reads survive a transient server error"
kind: fix
status: ready
type: proposal
track: general
date: 2026-11-16
---

# x01084 — The integration engine's forge reads survive a transient server error

## goal

A GET the land engine makes to the forge that fails with HTTP 502, 503 or 504, or a connection reset or timeout, is retried up to three more times (1 s, 3 s, 9 s) before the pass fails. Writes and 4xx answers are never retried.

## why

A rehearsal scenario died on `GET pulls?... failed: gh: HTTP 504`: the land client in core has no retry, so one transient server error ends a pass that the next read would have completed.

## non-goals

- The rehearsal harness keeps its own copy until PR #2270 merges. Follow-up: after #2270 merges, the rehearsal harness (plugins/integration rehearsal-forge-retry.helper.ts) should import this core helper and delete its own copy; this proposal does not touch it.
- No retry of writes (POST/PATCH/PUT/DELETE) and none of 4xx.

## slices

- global_gate: type

### S1 — Retry idempotent forge reads on a transient error
- **Status**: pending
- **Files**: `packages/core/src/lib/contracts/constants/forge-read-retry.constant.ts`, `packages/core/src/lib/integration/land/forge-read-retry.helper.ts`, `packages/core/src/lib/integration/land/github-land-forge.service.ts`, `packages/core/tests/src/lib/integration/land/forge-read-retry.helper.spec.ts`, `packages/core/tests/src/lib/integration/land/github-land-forge.service.spec.ts`, `plugins/integration/src/lib/contracts/interfaces/integration-pass.interface.ts`, `plugins/integration/src/lib/services/integration-pass.service.ts`
- **Gate**: type
- acceptance:
  - "forge-read-retry.helper.spec.ts proves a 504 then 200 GET succeeds after one wait of 1000 ms, four 504s fail with '(4 attempts)' and waits 1000/3000/9000, a 404 GET is not retried, a POST answering 504 is not retried, and an ECONNRESET on a GET is retried."
  - "github-land-forge.service.spec.ts proves the land client retries a 504 read through the injected wait and never retries a write."
  - "FORGE_READ_RETRY in contracts/constants/forge-read-retry.constant.ts is the one place that names the statuses (502, 503, 504), the 3 retries and the delays 1000/3000/9000 ms."
  - "integration-pass.service.ts is the composition root that supplies the real wait to createGithubLandForge; specs inject a fake and use no real timer."

## acceptance

- forge-read-retry.helper.spec.ts proves a 504 then 200 GET succeeds after one wait of 1000 ms, four 504s fail with '(4 attempts)' and waits 1000/3000/9000, a 404 GET is not retried, a POST answering 504 is not retried, and an ECONNRESET on a GET is retried.
- github-land-forge.service.spec.ts proves the land client retries a 504 read through the injected wait and never retries a write.
- FORGE_READ_RETRY in contracts/constants/forge-read-retry.constant.ts is the one place that names the statuses (502, 503, 504), the 3 retries and the delays 1000/3000/9000 ms.
- integration-pass.service.ts is the composition root that supplies the real wait to createGithubLandForge; specs inject a fake and use no real timer.
