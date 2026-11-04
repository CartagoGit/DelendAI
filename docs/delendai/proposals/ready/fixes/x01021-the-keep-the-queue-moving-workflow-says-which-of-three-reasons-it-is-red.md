---
id: x01021
title: "The keep-the-queue-moving workflow says which of three reasons it is red"
kind: fix
status: ready
type: proposal
track: a00095-consistency
date: 2026-11-04
---

# x01021 — The keep-the-queue-moving workflow says which of three reasons it is red

## goal

The workflow reports an internal error, a blocked queue and an open security alert as three separate states, so a red run says what to do.

## why

TODO: why this work matters now.

## non-goals

- TODO: what this proposal deliberately skips.

## slices

- global_gate: none

### S1 — The report script prints one state line
- **Status**: pending
- **Files**: `tools/scripts/forge/keep-the-queue-moving.script.ts`
- **Gate**: type
- acceptance:
  - "The script ends with exactly one line naming its state: internal-error (it threw), queue-blocked (candidates wait on a person or a red develop) or ok; a spec covers each."

### S2 — The workflow summary names the state of each step
- **Status**: pending
- **Files**: `.github/workflows/keep-the-queue-moving.yml`
- **Gate**: none
- acceptance:
  - "The run summary lists internal error, queue blocked and open security alert as three separate lines, each pass or fail, and the job stays red when any fails. The workflow is generated: the slice edits its generator source if it has one."

## acceptance

- The script ends with exactly one line naming its state: internal-error (it threw), queue-blocked (candidates wait on a person or a red develop) or ok; a spec covers each.
- The run summary lists internal error, queue blocked and open security alert as three separate lines, each pass or fail, and the job stays red when any fails. The workflow is generated: the slice edits its generator source if it has one.
