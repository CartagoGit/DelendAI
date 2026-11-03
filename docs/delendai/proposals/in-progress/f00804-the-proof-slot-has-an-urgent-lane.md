---
id: f00804
title: "The proof slot has an urgent lane"
kind: feat
status: in-progress
type: proposal
track: a00095-consistency
date: 2026-11-03
last-transition-id: 9a7b70f7-ef48-490d-bb01-7c581daf8f70
last-correlation-id: 9a7b70f7-ef48-490d-bb01-7c581daf8f70
last-transition-from: ready
last-transition-at: 2026-11-03T17:09:54.478Z
---

# f00804 — The proof slot has an urgent lane

## goal

A proof that repairs a red integration branch, or states why it is urgent, takes the machine's compute slot next, ahead of every waiting normal proof, without interrupting the one running.

## why

The machine has one proof slot (`withComputeSlot`), served first come first served. On 2026-11-03 `develop` went red, and the forge queue then arms nothing except a candidate that repairs it. The repair's proof was one candidate among the others: it waited behind about 10 proofs for over an hour (measured from the moment it asked for the slot to the moment it got it), and in that hour nothing else could land, because everything waited on the one change that unblocks the rest. A first-come-first-served slot is fair when every proof is equal; when `develop` is red, they are not, and the repair is the only proof whose result frees the others. The same holds, rarely, for a proof the owner or an agent can justify in words. The slot has no way to say either, so the whole queue paid for an hour of proofs that could not land.

The change is an urgent lane: a unit is urgent when its proposal is a fix and the integration branch's latest certification is red, or when the caller passes `--urgent=<reason>` to prove, deliver or publish. An urgent caller takes the slot next, ahead of every waiting normal caller, but never interrupts a proof already running. Only one urgent proof runs at a time; the rest queue in order. The turn is recorded with its reason where the slot already logs its holder (the owner file, plus an urgent log beside the lock), so the owner sees every jump, and `work status` and the slot's waiting message show the lane.

## non-goals

- No preemption: a proof already running is never interrupted, stopped or paused for an urgent one; the urgent one waits for it to end.
- No priority for anything but a repair of a red integration branch or a stated reason: no priority by agent, proposal size, age or kind other than fix.
- No change to the unit and tip join, to the stale-holder reclaim, or to how normal callers queue among themselves.

## slices

- global_gate: none

### S1 — Urgent lane in the compute slot
- **Status**: pending
- **Files**: `packages/core/src/lib/shared/compute-slot.service.ts`, `packages/core/src/lib/shared/compute-slot-lane.service.ts`, `packages/core/src/lib/contracts/interfaces/urgent-turn.interface.ts`, `packages/core/src/lib/contracts/interfaces/compute-slot.interface.ts`, `packages/core/src/runtime/index.ts`, `packages/core/src/lib/contracts/interfaces/unit-proof.interface.ts`, `packages/core/src/lib/work-units/work-unit-proof.service.ts`, `packages/core/src/lib/work-units/work-unit-prove.service.ts`, `packages/core/src/lib/work-units/work-unit-publish.service.ts`, `packages/core/src/lib/work-units/work-unit-status.service.ts`, `packages/core/src/lib/work-units/urgent-turn.service.ts`, `packages/core/tests/src/lib/shared/compute-slot.service.spec.ts`, `packages/core/tests/src/lib/work-units/urgent-turn.service.spec.ts`, `packages/cli/src/contracts/constants/work-command.constant.ts`
- **Gate**: none
- acceptance:
  - "An urgent caller takes the compute slot ahead of every waiting normal caller; a spec shows it."
  - "Two urgent callers run in arrival order, one at a time; a spec shows it."
  - "A proof already running is never interrupted by an urgent caller; a spec shows it."
  - "The urgent turn is recorded with its reason in the slot owner file and an urgent log; a spec shows it."
  - "A unit is urgent when its proposal is a fix and the integration branch latest certification is red, or when --urgent=<reason> is passed to prove, deliver or publish; work status and the waiting message show the urgent lane."

## acceptance

- An urgent caller takes the compute slot ahead of every waiting normal caller; a spec shows it.
- Two urgent callers run in arrival order, one at a time; a spec shows it.
- A proof already running is never interrupted by an urgent caller; a spec shows it.
- The urgent turn is recorded with its reason in the slot owner file and an urgent log; a spec shows it.
- A unit is urgent when its proposal is a fix and the integration branch latest certification is red, or when --urgent=<reason> is passed to prove, deliver or publish; work status and the waiting message show the urgent lane.
