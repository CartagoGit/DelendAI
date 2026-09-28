---
id: x00719
title: "Validate is green where agents run it"
kind: fix
status: in-progress
type: proposal
track: trust
date: 2026-09-28
priority: P1
related: [x00707, x00712]
---

# x00719 — Validate is green where agents run it

## goal

`bun run validate` passes in the checkout agents run it in, the shared
checkout on the integration branch included, when nothing is wrong.

## why

Two red results there had nothing to do with the code.

- `verify:tools` probes every tool. In the shared checkout on `develop`
  the write guard (x00707) refuses `fs_write` and the scaffold tools, as
  it should. The probe read that refusal as an output that does not match
  the tool's schema, and failed. From a unit's worktree the same probe
  passed.
- The host server's startup reconciliation takes a lock under
  `.cache/delendai/startup/`, and `check-stray-cache-files` did not know
  that directory, so every checkout a server had started in was reported
  as holding stray files.

An agent that finds `validate` red for reasons it did not cause learns to
ignore it.

## why this design

- **The refusal carries a stable code.** `toolError` takes an optional
  `code`, and the guard answers `shared-checkout-write-refused`
  (`contracts/constants/write-refusal.constant.ts`). The probe reads the
  code, not the prose. It reports the tool as `needs-input`: the guard
  answered correctly, and the tool is probed where writes land (a unit's
  worktree, CI). Any other error still fails. The code is public, because
  `verify:tools` may only import core's public barrel; to keep the barrel
  within its budget, `IBudgetForSurface`, which nothing references, leaves
  it.
- **One name for the startup directory.** `STARTUP_CACHE_DIR` is shared by
  the host server and the stray-files lint, so they cannot drift apart
  again.

## non-goals

- Letting the probe write in the shared checkout.

## architecture

- `packages/core/src/lib/contracts/constants/write-refusal.constant.ts`,
  `shared/tool-response.ts`, `shared/bind-write-root.ts`.
- `tools/scripts/verify/verify-probes.ts`.
- `tools/scripts/lib/startup-cache-dir.constant.ts`,
  `host/host-server.script.ts`, `lint/check-stray-cache-files.script.ts`.

## Slices

- global_gate: none

### S1 — The guard's refusal is policy, the startup lock is sanctioned

- **Status**: in-progress
- **Gate**: `npx vitest run tools/scripts/verify/verify-probes.spec.ts packages/core/tests/src/lib/shared/bind-write-root.spec.ts`
- **Files**:
  - `packages/core/src/lib/contracts/constants/write-refusal.constant.ts`
  - `packages/core/src/lib/shared/tool-response.ts`
  - `packages/core/src/lib/shared/bind-write-root.ts`
  - `packages/core/tests/src/lib/shared/bind-write-root.spec.ts`
  - `packages/core/src/public/index.ts`
  - `tools/scripts/lint/core-public-consumers.baseline.json`
  - `tools/scripts/verify/verify-probes.ts`
  - `tools/scripts/verify/verify-probes.spec.ts`
  - `tools/scripts/lib/startup-cache-dir.constant.ts`
  - `tools/scripts/host/host-server.script.ts`
  - `tools/scripts/lint/check-stray-cache-files.script.ts`

## dependency graph

None.

## acceptance

- A write the guard refuses carries `error.code:
  shared-checkout-write-refused`, and the probe reports it as
  `needs-input`. Any other error still fails the probe.
- `.cache/delendai/startup/` is not reported as stray.
