---
id: x00947
title: "A work unit's identity, claim and generation follow the project's policy, not origin's defaults"
kind: fix
status: review
type: proposal
track: a00095-consistency
date: 2026-10-23
last-transition-id: c62b8a6c-4345-4bdb-85a6-de1ccabaa61d
last-correlation-id: c62b8a6c-4345-4bdb-85a6-de1ccabaa61d
last-transition-from: in-progress
last-transition-at: 2026-10-24T11:33:32.507Z
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
- **Status**: done
- **Files**: `packages/core/src/lib/work-units/work-unit-claim.service.ts`, `packages/core/src/lib/work-units/unit-adoption.service.ts`, `packages/core/src/lib/work-units/unit-ref-rename.service.ts`
- **Gate**: type
- acceptance:
  - "After work claim, the lease's owner, the ref and the unit records all name the claimant (D26)."
  - "Claiming onto a destination ref that exists is refused with the holder named (ORCH-02)."
  - "work claim with no identity says the identity is missing instead of 'nothing claimable' (D34)."
  - "After a claim the unit is read under one name: its ref, its lease and its forge copy all carry the new one (C12)."
- shipped-in: `e8580344b322`
- review-state: in_review
- review-implementer: claude-opus-5-5

### S2 — Generations follow the integration remote
- **Status**: done
- **Files**: `packages/core/src/lib/work-units/work-unit-generation.service.ts`
- **Gate**: type
- acceptance:
  - "With the policy's integration remote set to a name other than origin, spent generations are read from that remote; a spec with two remotes proves it (D28)."
- shipped-in: `0ed69db92ea6`
- review-state: in_review
- review-implementer: claude-opus-5-5

### S3 — commit-policy checkpoints respect ownership
- **Status**: done
- **Files**: `plugins/commit-policy/src/lib/persistence/wip-persistence.ts`, `plugins/commit-policy/src/lib/persistence/wip-persistence.interface.ts`, `plugins/commit-policy/src/lib/engine.ts`, `plugins/commit-policy/src/lib/contracts/interfaces/persistence.interface.ts`, `plugins/commit-policy/src/index.ts`, `packages/core/src/lib/work-units/slice-holders.service.ts`, `packages/core/src/cli.ts`
- **Gate**: type
- acceptance:
  - "A WIP checkpoint for a slice another agent's unit owns is refused; one agent never gets two refs for one slice (CP-04, C7)."
- shipped-in: `d85b00670bd7`
- review-state: in_review
- review-implementer: claude-opus-5-5

### S4 — A quota stop leaves resumable work
- **Status**: done
- **Files**: `packages/core/src/lib/work-units/stranded-edits.service.ts`, `packages/core/src/lib/work-units/unit-forge-sync.service.ts`, `packages/core/src/lib/work-units/work-unit-status.service.ts`, `packages/core/src/lib/contracts/interfaces/stranded-edits.interface.ts`, `packages/core/src/lib/contracts/constants/stranded-edits.constant.ts`
- **Gate**: type
- acceptance:
  - "Work an agent left uncommitted in the shared checkout is kept at the next start-up under a ref named for the agent whose live unit covers it (unattributed otherwise), never committed onto the shared branch and without touching the checkout, and `work status` tells the owner how to bring it into a unit (G151)."
- shipped-in: `83957c54d1eb`
- review-state: in_review
- review-implementer: claude-opus-5-5

## acceptance

- After work claim, the lease's owner, the ref and the unit records all name the claimant (D26).
- Claiming onto a destination ref that exists is refused with the holder named (ORCH-02).
- work claim with no identity says the identity is missing instead of 'nothing claimable' (D34).
- After a claim the unit is read under one name: its ref, its lease and its forge copy all carry the new one (C12).
- With the policy's integration remote set to a name other than origin, spent generations are read from that remote; a spec with two remotes proves it (D28).
- A WIP checkpoint for a slice another agent's unit owns is refused; one agent never gets two refs for one slice (CP-04, C7).
- Work an agent left uncommitted in the shared checkout is kept at the next start-up under a ref named for the agent whose live unit covers it (unattributed otherwise), never committed onto the shared branch and without touching the checkout, and `work status` tells the owner how to bring it into a unit (G151).
