---
id: x00947
title: "A work unit's identity, claim and generation follow the project's policy, not origin's defaults"
kind: fix
status: in-progress
type: proposal
track: a00095-consistency
date: 2026-10-23
last-transition-id: 16600aa3-4e8d-4586-ad46-cc5c24a198b7
last-correlation-id: 16600aa3-4e8d-4586-ad46-cc5c24a198b7
last-transition-from: ready
last-transition-at: 2026-10-24T11:13:57.284Z
---

# x00947 — A work unit's identity, claim and generation follow the project's policy, not origin's defaults

## goal

work claim moves a unit's whole identity or refuses, never overwrites an occupied ref, and says why nothing is claimable; generations are counted against the integration remote the policy names; commit-policy's WIP checkpoint respects slice ownership; and a unit stranded by a quota stop can be resumed by its owner.

## why

Joint audit a00095. D26: work claim renames the ref but moveLease rewrites only `ref`, not `owner`. gpt-6.1-sol ORCH-02 (P1): claim overwrites an occupied destination ref. D34: work claim without identity says there is nothing claimable. D28: spent generations are always counted against origin, whatever remote the integration policy uses. Sol CP-04: the WIP checkpoint does not check who owns the slice and creates duplicate refs per agent. C7: two identities in the same slice and a wip with 47 commits never integrated. C12: one unit is named two ways and the orchestrator split one proposal into two units. G151: an agent that runs out of quota leaves its work stranded, edited in the shared checkout.

## non-goals

- Deleting refs (the ref-maintenance proposal).
- Identity spelling rules (x00923 and the hosts proposal).

## slices

- global_gate: type

### S1 — Claim moves the whole identity or refuses
- **Status**: pending
- **Files**: `packages/core/src/lib/work-units/work-unit-claim.service.ts`, `packages/core/src/lib/work-units/unit-adoption.service.ts`, `packages/core/src/lib/work-units/unit-ref-rename.service.ts`, `packages/core/src/lib/work-units/work-claim.service.ts`, `packages/cli/src/commands/work.command.ts`
- **Gate**: type
- acceptance:
  - "After work claim, the lease's owner, the ref and the unit records all name the claimant (D26)."
  - "Claiming onto a destination ref that exists is refused with the holder named (ORCH-02)."
  - "work claim with no identity says the identity is missing instead of 'nothing claimable' (D34)."
  - "One unit has one name in every command's output and input (C12)."

### S2 — Generations follow the integration remote
- **Status**: pending
- **Files**: `packages/core/src/lib/work-units/work-unit-generation.service.ts`
- **Gate**: type
- acceptance:
  - "With the policy's integration remote set to a name other than origin, spent generations are read from that remote; a spec with two remotes proves it (D28)."

### S3 — commit-policy checkpoints respect ownership
- **Status**: pending
- **Files**: `plugins/commit-policy/src/lib/persistence/wip-persistence.ts`, `plugins/commit-policy/src/lib/persistence/wip-persistence.interface.ts`, `plugins/commit-policy/src/lib/engine.ts`
- **Gate**: type
- acceptance:
  - "A WIP checkpoint for a slice another agent's unit owns is refused; one agent never gets two refs for one slice (CP-04, C7)."

### S4 — A quota stop leaves resumable work
- **Status**: pending
- **Files**: `packages/core/src/lib/work-units/unit-forge-sync.service.ts`
- **Gate**: type
- acceptance:
  - "Work an agent left uncommitted in the shared checkout is carried into a unit named for that agent at the next start-up, never committed onto the shared branch, and `work status` tells the owner how to resume it (G151)."

## acceptance

- After work claim, the lease's owner, the ref and the unit records all name the claimant (D26).
- Claiming onto a destination ref that exists is refused with the holder named (ORCH-02).
- work claim with no identity says the identity is missing instead of 'nothing claimable' (D34).
- One unit has one name in every command's output and input (C12).
- With the policy's integration remote set to a name other than origin, spent generations are read from that remote; a spec with two remotes proves it (D28).
- A WIP checkpoint for a slice another agent's unit owns is refused; one agent never gets two refs for one slice (CP-04, C7).
- Work an agent left uncommitted in the shared checkout is carried into a unit named for that agent at the next start-up, never committed onto the shared branch, and `work status` tells the owner how to resume it (G151).
