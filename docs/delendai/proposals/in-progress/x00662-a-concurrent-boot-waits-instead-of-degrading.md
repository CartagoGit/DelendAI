---
id: x00662
title: "A concurrent boot waits instead of degrading"
kind: fix
status: in-progress
type: proposal
track: trust
date: 2026-09-26
priority: P1
related: [x00658, x00648]
---

# x00662 — A concurrent boot waits instead of degrading

## goal

Two servers starting on one workspace at the same moment both come up
without reporting a broken workspace, and a lock left by a dead process
does not block the next boot.

## why

On 2026-09-26 the host booted `DEGRADED` with `[ERROR]
startup-reconciliation.mutex.busy: Another startup reconciliation is
already running (ea83c203a883d11c#3252897)`. Two host servers were
running on the workspace. One was started by Claude Code
(`--workspace=.`), the other by VS Code (`--workspace=<absolute>`):
each client starts its own. Both reconciled at boot, one lost the
mutex, and the loser reported a blocker. It returned `mode: skipped` at
once, although the winner needed a few seconds. The pid in the message
no longer existed. A server killed mid-boot by an editor restart leaves
its lock behind, and the next boot was refused until the lock's 2-minute
TTL ran out.

## why this design

- **Wait, then reconcile.** A boot that finds the mutex busy asks again
  every 500 ms for up to 10 s. That is long enough for an incremental
  reconcile, and short enough that the MCP client waiting for
  `initialize` does not give up first. The wait is bounded by attempts,
  not by the clock, so a clock that does not move cannot turn it into a
  hang.
- **Still busy is a note, not a blocker.** Another live boot is
  reconciling this workspace right now, and its report is the one that
  counts. Nothing about the workspace is wrong.
- **A dead holder is abandoned now.** The mutex records the machine and
  pid of its holder. A holder on this machine whose process no longer
  exists is taken over immediately (`process.kill(pid, 0)`, where
  `EPERM` counts as alive). The work-ref lock (x00648) is built on the
  same mutex and gets the same behaviour.

## non-goals

- Sharing one server between clients.
- A holder on another machine. Its liveness cannot be probed, so the TTL
  still governs it.

## architecture

- `packages/core/src/lib/startup-reconciler/mutex-wait.ts`:
  `acquireWaiting`. `reconcile-startup.ts` (+ `.interface.ts`) holds
  `mutexWait` and the note.
- `packages/core/src/lib/startup-reconciler/startup-mutex.ts` (+
  `.interface.ts`): `isAlive`, dead-holder takeover.

## Slices

- global_gate: none

### S1 — A concurrent boot waits, and a dead holder is abandoned

- **Status**: review
- **Gate**: `npx vitest run packages/core/tests/src/lib/startup-reconciler packages/core/tests/src/lib/startup-gate`
- **Files**:
  - `packages/core/src/lib/startup-reconciler/reconcile-startup.ts`
  - `packages/core/src/lib/startup-reconciler/reconcile-startup.interface.ts`
  - `packages/core/src/lib/startup-reconciler/mutex-wait.ts`
  - `packages/cli/src/lib/work-publish.service.spec.ts`
  - `packages/core/src/lib/startup-reconciler/startup-mutex.ts`
  - `packages/core/src/lib/startup-reconciler/startup-mutex.interface.ts`
  - `packages/core/tests/src/lib/startup-reconciler/ambiguous-conditions.spec.ts`

## dependency graph

None.

## acceptance

- With a live holder that does not finish, the second boot does not
  reconcile, leaves the database alone, and reports `mutex.busy` as a
  note with no blockers.
- With a holder that finishes within the wait, the second boot
  reconciles.
- A lock held by a pid that no longer exists on this machine is taken
  over at once.
