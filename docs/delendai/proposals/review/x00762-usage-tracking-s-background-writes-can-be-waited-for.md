---
id: x00762
title: "Usage tracking's background writes can be waited for"
kind: fix
status: review
type: proposal
track: trust
date: 2026-09-29
priority: P1
related: [x00641]
last-transition-id: 732003be-df5b-46a0-b0f2-57c7539d425d
last-correlation-id: 732003be-df5b-46a0-b0f2-57c7539d425d
last-transition-from: in-progress
---

# x00762 — Usage tracking's background writes can be waited for

## goal

Once `drainLiveBuffers` returns, nothing the usage-tracking plugin started
is still writing into its cache directory.

## why

The quality gate on the release pull request #641 (run `36607225046`)
failed on `usage-tracking plugin.spec.ts`: removing the test's directory
raised `ENOTEMPTY` (`rmdir …/usage-tracking`). Registering the plugin
starts three writes without awaiting them — the stale-tmp sweep, the
pricing refresh and the summary rollup — and the 5-minute rollup timer
starts more. `drainLiveBuffers`, the one seam callers have, waited only
for the record buffers, so a caller that removed the directory after it
raced those writes. Every test in the file raced them; which one lost was
chance.

## why this design

- The writes stay off the hot path: the plugin still never awaits them.
- They are started through `trackBackgroundWork`, and `drainLiveBuffers`
  waits for them too, until none is left (a write may start another).
  One seam, already wired to `beforeExit`, so a normal exit also keeps
  the rollup it was about to write.
- A failed background write is still swallowed, as before; tracking it
  changes when it can be waited for, not what it reports.

## non-goals

- Awaiting these writes on the hot path, or reporting their failures.

## Slices

- global_gate: none

### S1 — Drain waits for the writes the plugin started

- **Status**: review
- **Gate**: `npx vitest run plugins/usage-tracking`
- **Files**:
  - `plugins/usage-tracking/src/lib/record-buffer.ts`
  - `plugins/usage-tracking/src/index.ts`
  - `plugins/usage-tracking/tests/src/lib/record-buffer.spec.ts`
  - `plugins/usage-tracking/tests/src/lib/plugin.spec.ts`
- shipped-in: `ec4fc3ebe938`

## dependency graph

None.

## acceptance

- `drainLiveBuffers` returns only after every tracked write, and every
  write those started, has settled.
- Registering the plugin, draining and removing its cache directory never
  raises `ENOTEMPTY` (five rounds in one spec; fifteen consecutive runs
  of the file green).
