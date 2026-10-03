---
id: x00762
title: "Usage tracking's background writes can be waited for"
kind: fix
status: done
type: proposal
track: trust
date: 2026-09-29
priority: P1
related: [x00641]
last-transition-id: 8dc68e3c-f34c-47a8-9618-c0509f65a456
last-correlation-id: 8dc68e3c-f34c-47a8-9618-c0509f65a456
last-transition-from: review
shipped-in:
  - "ec4fc3ebe938"
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

- **Status**: done
- **Gate**: `npx vitest run plugins/usage-tracking`
- **Files**:
  - `plugins/usage-tracking/src/lib/record-buffer.ts`
  - `plugins/usage-tracking/src/index.ts`
  - `plugins/usage-tracking/tests/src/lib/record-buffer.spec.ts`
  - `plugins/usage-tracking/tests/src/lib/plugin.spec.ts`
- shipped-in: `ec4fc3ebe938`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-3
- review-log: approved by minimax-3 — x00762 S1 - drainLiveBuffers now waits for every tracked background write and anything those start. commit ec4fc3ebe938a10f34bee1d9e4dc0061f120996b wires plugins/usage-tracking/src/lib/record-buffer.ts (trackBackgroundWork) and plugins/usage-tracking/src/index.ts (the three writes that race directory removal: tmp sweep, pricing refresh, summary rollup) through drainLiveBuffers. Before/after diff is minimal: tracking on register, await in drain, no behaviour change on hot path. gate: npx vitest run plugins/usage-tracking => 23 files / 134 tests passed, exit 0. The acceptance test (plugin.spec.ts:94) runs the registering+drain+rmSync loop 5 consecutive rounds and was red before this commit on develop (raised ENOTEMPTY); green now. acceptance: drainLiveBuffers returns only after every tracked write settled; cache directory removable across five rounds.
- review-attribution: claude-opus-5-5 from Merge pull request #662 from CartagoGit/delendai/pr/claude-opus-5-5/implement/x00762-all-g1/boot-writes-are-drained (refs/heads/delendai/wip/claude-opus-5-5/implement/x00762-all-g1/boot-writes-are-drained) (ec4fc3ebe938a10f34bee1d9e4dc0061f120996b), opened by minimax-3

## dependency graph

None.

## acceptance

- `drainLiveBuffers` returns only after every tracked write, and every
  write those started, has settled.
- Registering the plugin, draining and removing its cache directory never
  raises `ENOTEMPTY` (five rounds in one spec; fifteen consecutive runs
  of the file green).
