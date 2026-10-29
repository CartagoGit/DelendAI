---
id: x00872
title: "close_slice resolves its actor and swarm state from one place, so a unit's owner can close"
kind: fix
status: done
type: proposal
track: general
date: 2026-10-03
last-transition-id: 8ffb20f7-a120-4421-94d6-2c4b911d82ef
last-correlation-id: 8ffb20f7-a120-4421-94d6-2c4b911d82ef
last-transition-from: review
shipped-in:
  - "c0086c3ad3b5017bae005f839b75894533fea65c"
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
- **Status**: done
- **Files**: `plugins/proposals/src/lib/swarm/close-actor.resolver.ts`, `plugins/proposals/src/lib/swarm/validation-provider.ts`, `plugins/proposals/src/lib/services/close-blocker.ts`, `plugins/proposals/src/lib/tools/authoring.tool.ts`, `plugins/proposals/src/lib/tools/authoring-options.ts`, `plugins/proposals/src/index.ts`, `plugins/proposals/tests/src/lib/swarm/validation-provider.spec.ts`, `plugins/proposals/tests/src/lib/swarm/close-actor.resolver.spec.ts`, `plugins/proposals/tests/src/lib/services/close-blocker.spec.ts`, `plugins/proposals/src/lib/contracts/interfaces/close-actor.interface.ts`, `plugins/proposals/tests/src/lib/e2e/close-slice-actor.e2e.spec.ts`, `tools/scripts/lint/check-stray-cache-files.script.ts`, `tools/scripts/lint/check-stray-cache-files.script.spec.ts`
- **Gate**: `npx vitest run plugins/proposals/tests/src/lib/swarm/close-actor.resolver.spec.ts plugins/proposals/tests/src/lib/e2e/close-slice-actor.e2e.spec.ts plugins/proposals/tests/src/lib/services/close-blocker.spec.ts`
- acceptance:
  - "a claim spelled proposal/slice satisfies the gate for the slice proposal-SLICE"
  - "the actor is resolved from the agent argument, then DELENDAI_AGENT_ID, then the checkout's work ref"
  - "the owner of the unit the checkout is on is active for that unit's slices without a claim"
  - "a refusal names the resolved actor and the files it read, and only suggests a claim when none exists"
- shipped-in: `f5f4bd40ed0d`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: glm-5.3-flash
- review-log: approved by glm-5.3-flash — verified at c0086c3ad3b5, validate exit 0, tests 19/19 — Exact gate passed: 3 files, 19/19 tests. Acceptance verified against tests and implementation.

## acceptance

- a claim spelled proposal/slice satisfies the gate for the slice proposal-SLICE
- the actor is resolved from the agent argument, then DELENDAI_AGENT_ID, then the checkout's work ref
- the owner of the unit the checkout is on is active for that unit's slices without a claim
- a refusal names the resolved actor and the files it read, and only suggests a claim when none exists
