---
id: x00709
title: "A server behind its checkout stops pushing"
kind: fix
status: review
type: proposal
track: trust
date: 2026-09-27
priority: P0
related: [x00701, x00691, x00697]
last-transition-id: 107136f8-0dc1-4237-a833-3bc8744cdd94
last-correlation-id: 107136f8-0dc1-4237-a833-3bc8744cdd94
last-transition-from: in-progress
---

# x00709 — A server behind its checkout stops pushing

## goal

A delendai server whose checkout has moved past code it runs changes no
shared state in the background. It resumes once it is restarted.

## why

On 2026-09-27 `delendai/wip/minimax-3/review/x00525-review-g1/…` was
pushed to origin by this machine and deleted by CI's reaper every few
minutes. The pusher was a host server started on 2026-09-26, whose
work-checkout publisher ran code from before x00691, the fix that
recognises delivered work and does not push it back. x00701 made such a
server say so on every tool result, but its background publisher asks no
tool and read nothing. The memory of this project records the same
failure before: an eight-day-old server deleting work refs. A server
cannot know which of its rules the checkout has since replaced, so the
safe answer is that it mutates nothing shared until restarted.

## why this design

- **One reading.** x00701's watch now also answers `behind()`, read
  afresh. The host hands it to plugins as
  `IMcpPluginContext.runtimeBehindCheckout`. No second definition of
  "runtime code", and no new public export.
- **Stand down, do not guess.** The publisher skips the pass and says why.
  Work stays committed in its worktree; only its remote copy waits for the
  restart.

## non-goals

- Restarting the server itself.
- Standing down tool calls an agent makes. The advisory covers those.

## architecture

- `packages/core/src/lib/development-policy/stale-runtime-advisory.ts`: `createStaleRuntimeWatch`.
- `packages/core/src/lib/plugins/plugin-contract.ts`: `runtimeBehindCheckout`.
- `packages/core/src/lib/cli/assemble.ts`: feeds it.
- `plugins/commit-policy`: the publisher's `standDown`.

## Slices

- global_gate: none

### S1 — The publisher stands down on older code

- **Status**: review
- **Gate**: `npx vitest run packages/core/tests/src/lib/development-policy/stale-runtime-advisory.spec.ts plugins/commit-policy/tests/src/lib/services/work-checkout-publisher.service.spec.ts`
- **Files**:
  - `packages/core/src/lib/development-policy/stale-runtime-advisory.ts`
  - `packages/core/src/lib/development-policy/stale-runtime-advisory.interface.ts`
  - `packages/core/src/lib/plugins/plugin-contract.ts`
  - `packages/core/src/lib/cli/assemble.ts`
  - `packages/core/tests/src/lib/development-policy/stale-runtime-advisory.spec.ts`
  - `plugins/commit-policy/src/index.ts`
  - `packages/core/src/lib/wip-engine/work-checkout-publisher.interface.ts`
  - `packages/core/src/lib/wip-engine/work-checkout-publisher.ts`
  - `packages/core/tests/src/lib/wip-engine/work-checkout-publisher.spec.ts`

## dependency graph

None.

## acceptance

- While the host answers that the server is behind, a tick pushes nothing
  and says why. Once current, it publishes.
- `behind()` reads afresh: runtime changes make it answer, doc-only
  changes do not.
