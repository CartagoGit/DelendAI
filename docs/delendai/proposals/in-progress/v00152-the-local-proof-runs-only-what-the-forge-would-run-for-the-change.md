---
id: v00152
title: "The local proof runs only what the forge would run for the change"
kind: perf
status: in-progress
type: proposal
track: ci
date: 2026-10-31
last-transition-id: 77d65c8c-e9b4-47b0-ab52-daa9c716ca39
last-correlation-id: 77d65c8c-e9b4-47b0-ab52-daa9c716ca39
last-transition-from: ready
last-transition-at: 2026-10-31T23:43:10.547Z
---

# v00152 — The local proof runs only what the forge would run for the change

## goal

The local proof runs what the forge would run for the change and nothing more, and a passing commit puts nothing into an agent's context.

## why

`bun run prove` ran every static check for every change, including those `job-scope` skips on the forge, so a documentation unit ran the typecheck and Biome to prove nothing the forge would check. Lefthook printed its whole table on every commit: 1.5 MB of 46 MB of tool output in one working session (3%).

The gain of the first part is modest and is stated as such: the longest lints run for every change on the forge too, so a documentation unit saves its typecheck, Biome and manifest checks, not the bulk of its 130 s.

## non-goals

- Running `quality-gate` beside the others: it rebuilds `build/` while `lint-presets` walks it.
- Hiding a failure: a failing hook prints as before.

## slices

- global_gate: type

### S1 — The proof follows job-scope
- **Status**: pending
- **Files**: `tools/scripts/ci/prove-plan.script.ts`
- **Gate**: type
- acceptance:
  - "`bun run prove` and `prove:plan` filter the static checks and the typecheck through `jobMustRun`, so a check the forge skips for the change is skipped locally, and an unknown job runs."

### S2 — Hooks are quiet when they pass
- **Status**: pending
- **Files**: `lefthook.yml`
- **Gate**: type
- acceptance:
  - "`lefthook.yml` prints on failure only."

## acceptance

- `bun run prove` and `prove:plan` filter the static checks and the typecheck through `jobMustRun`, so a check the forge skips for the change is skipped locally, and an unknown job runs.
- `lefthook.yml` prints on failure only.
