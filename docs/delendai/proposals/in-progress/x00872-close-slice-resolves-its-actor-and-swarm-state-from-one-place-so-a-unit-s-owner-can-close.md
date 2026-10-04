---
id: x00872
title: "close_slice resolves its actor and swarm state from one place, so a unit's owner can close"
kind: fix
status: in-progress
type: proposal
track: general
date: 2026-10-03
last-transition-id: 67ccadd4-7714-4d10-aa10-78941cd70747
last-correlation-id: 67ccadd4-7714-4d10-aa10-78941cd70747
last-transition-from: ready
---

# x00872 — close_slice resolves its actor and swarm state from one place, so a unit's owner can close

## Goal

close_slice from a unit refused with 'not provably active' right after a successful claim. The gate looked for the task id spelled proposal-SLICE while claims carry proposal/slice, matched the actor only by an identity it never supplied, ignored who the caller is, and its refusal told agents to re-claim when a claim was not what was missing. Resolve the caller (agent argument, DELENDAI_AGENT_ID, the agent in the checkout's work ref), compare task ids in one canonical spelling, count the owner of the unit the checkout is on as active for that unit's slices, and make the refusal name the actor and the roots it read.

## why

Seven finished proposals cannot be handed to review through the tools because every close_slice from a unit is refused.

## non-goals

- Changing the unit lease or its files; ownership is derived from the work ref behind a seam the lease can replace
- Changing what force does

## Slices

- global_gate: none

### S1 — Resolve the closing actor and compare task ids canonically
- **Status**: pending
- **Files**: `plugins/proposals/src/lib/swarm/close-actor.resolver.ts`, `plugins/proposals/src/lib/swarm/validation-provider.ts`, `plugins/proposals/src/lib/services/close-blocker.ts`, `plugins/proposals/src/lib/tools/authoring.tool.ts`, `plugins/proposals/src/lib/tools/authoring-options.ts`, `plugins/proposals/src/index.ts`, `plugins/proposals/tests/src/lib/swarm/validation-provider.spec.ts`, `plugins/proposals/tests/src/lib/swarm/close-actor.resolver.spec.ts`, `plugins/proposals/tests/src/lib/services/close-blocker.spec.ts`
- **Gate**: none
- acceptance:
  - "a claim spelled proposal/slice satisfies the gate for the slice proposal-SLICE"
  - "the actor is resolved from the agent argument, then DELENDAI_AGENT_ID, then the checkout's work ref"
  - "the owner of the unit the checkout is on is active for that unit's slices without a claim"
  - "a refusal names the resolved actor and the files it read, and only suggests a claim when none exists"

## acceptance

- a claim spelled proposal/slice satisfies the gate for the slice proposal-SLICE
- the actor is resolved from the agent argument, then DELENDAI_AGENT_ID, then the checkout's work ref
- the owner of the unit the checkout is on is active for that unit's slices without a claim
- a refusal names the resolved actor and the files it read, and only suggests a claim when none exists
