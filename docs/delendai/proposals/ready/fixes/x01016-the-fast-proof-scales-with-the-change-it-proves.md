---
id: x01016
title: "The fast proof scales with the change it proves"
kind: fix
status: ready
type: proposal
track: a00095-consistency
date: 2026-11-03
last-transition-id: 51f91610-9667-4e15-a057-e2749ba09e4f
last-correlation-id: 51f91610-9667-4e15-a057-e2749ba09e4f
last-transition-from: review
last-transition-at: 2026-11-04T14:46:43.236Z
---

# x01016 — The fast proof scales with the change it proves

## goal

prove --fast ran every repo-wide gate for any change (936 s for a 3-file fix, ~15 min for a Markdown proposal). Measure each step, run each only where the change can affect it, and print and save a step-timing table.

## why

`bun run prove` (`prove-plan.script.ts --fast`) promises about 90 s. On 2026-11-03 it took 936 s for x01009, a 3-file fix, and a proposal-only Markdown change took about 15 minutes; about 10 units wait behind one proof slot.

Measured on 2026-11-03, each step run on its own (the machine at load 20 to 30):

- Proposal-only change, 651 s serial: tokens-budget-real 149 s, quality-gate 121 s, generated-artifacts-check 84 s, lint-presets 77 s, `gen:all:check` 66 s, lint-governance 58 s, lint-docs 48 s, lint-security 20 s, tool budgets 13 s, lint-architecture 11 s. Run alone, the generators that read proposals take 5 s together (agent-catalog 4.7 s, docs-index 0.5 s, roadmap drift 0.7 s, host-hints 0.7 s) and lint-governance 21 s. The rest read code the change cannot move.
- Small core `.ts` change: typecheck is 71 s cold with `tsc --noEmit` and 3.5 s warm with `--incremental`; biome-baseline is 13 s alone; the near specs for one leaf core file are 181 specs, which dominate the proof. Under contention the same steps showed 756 s (typecheck) and 1129 s (biome), because each waited on the machine's compute slot, not because it computed that long.
- The proof printed each step's time as it ended but no table, kept nothing, and `availableParallelism()` checks ran at once on a loaded machine.

## non-goals

- Weakening what the forge runs: CI still runs every job; only the local fast proof narrows.
- Reducing the near-spec selection for a code change.

## slices

- global_gate: none

### S1 — Scope and time the fast proof
- **Status**: pending
- **Files**: `tools/scripts/ci/prove-plan.script.ts`, `tools/scripts/ci/prove-plan.script.spec.ts`, `tools/scripts/typecheck.script.ts`
- **Gate**: none
- acceptance:
  - "isProposalOnly and timingTableOf are specified in prove-plan.script.spec.ts; the typecheck is incremental."
- shipped-in: `4a56f443ac5a`
- review-state: changes_requested
- review-implementer: claude-sonnet-5-5
- review-reviewer: gpt-5.3-codex
- review-log: requested_changes by gpt-5.3-codex — The shipped-in commit 4a56f443ac5a changes only tools/scripts/typecheck.script.ts (tsbuildinfo path). It does not implement or specify isProposalOnly/timingTableOf in tools/scripts/ci/prove-plan.script.ts and tools/scripts/ci/prove-plan.script.spec.ts, so S1 acceptance is not met. Repro: run `git show --name-only 4a56f443ac5a` and compare with the S1 Files/acceptance section in x01016.

## acceptance

- A proposal-only change runs the proposal gates and the generators that read proposals, and no code gate; a code change runs everything it ran before.
- Every proof prints its step timings, slowest first, and appends them to `.cache/delendai/results/logs/prove-timings.jsonl`.
- `tsc` runs incrementally with its build info under `.cache/delendai/tsc`.
