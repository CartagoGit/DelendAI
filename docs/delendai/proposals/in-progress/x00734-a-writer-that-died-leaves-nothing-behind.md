---
id: x00734
title: "A writer that died leaves nothing behind"
kind: fix
status: in-progress
type: proposal
track: trust
date: 2026-09-28
priority: P2
related: []
---

# x00734 — A writer that died leaves nothing behind

## goal

An atomic write whose process ended before it finished leaves no temporary
file behind for longer than the next write of the same file.

## why

Twice on 2026-09-28 a publication stopped at `check-stray-cache-files` on
`.cache/delendai/results/usage-tracking/pricing.json.<id>.tmp`, zero bytes.
usage-tracking refreshes its pricing table in the background; a
short-lived process (a CLI command, a generator) that loads it exits in the
middle of the write, after the temporary is opened and before it is
written or renamed. `writeFileAtomic` removes its temporary when the write
fails, not when the process dies, and nothing removed it later.

## why this design

- After a successful write, `writeFileAtomic` removes the temporaries of
  the same file that are empty and older than a minute: a dead writer's.
  Opening a temporary and writing it takes milliseconds, so a live writer's
  is never touched, and a temporary with content is left alone.
- Best effort: it never fails the write.

## non-goals

- Stopping short-lived processes from refreshing caches.

## architecture

- `packages/core/src/lib/shared/atomic-write.ts` and its spec.

## Slices

- global_gate: none

### S1 — The next write sweeps a dead writer's temporaries

- **Status**: in-progress
- **Gate**: `npx vitest run packages/core/tests/src/lib/shared/atomic-write.spec.ts`
- **Files**:
  - `packages/core/src/lib/shared/atomic-write.ts`
  - `packages/core/tests/src/lib/shared/atomic-write.spec.ts`

## dependency graph

None.

## acceptance

- Writing `pricing.json` removes an empty `pricing.json.<id>.tmp` an hour
  old, and keeps a fresh one, one with content and another file's.
