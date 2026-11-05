---
id: x01037
title: "work deliver on a create unit moves the new proposal to in-progress, then refuses"
kind: fix
status: ready
type: proposal
track: general
date: 2026-11-05
---

# x01037 — work deliver on a create unit moves the new proposal to in-progress, then refuses

## goal

`work deliver` on a unit of kind create publishes the proposal it created exactly as `work publish --kind=create` does, and changes nothing it then refuses.

## why

Seen three times on 2026-11-04 (x01034 among them): `delendai work deliver --proposal=<new id>` on a create unit runs `deliverUnit` (packages/cli/src/lib/work-deliver.service.ts), which first transitions the proposal ready -> in-progress (a commit in the unit, `chore(delendai): ... proposal_transition x01034 in-progr...`), proves, then transitions to review, where review entry refuses with `missing-declared-files`: the slices name files their implementation will create, so they cannot exist yet. The unit is left with a proposal in in-progress/ that nobody works on and nothing published; the agent has to revert the commit by hand and run `work publish --kind=create`. `deliverUnit` never looks at the unit's kind: the located unit's work ref says `create`, and a create unit has no slice to hand to review. Seen alongside on 2026-11-05: while one create unit of an agent was being published, that agent's freshly entered second create unit (another topic, same `new-all-g<n>` name) was retired within seconds, twice (refs/delendai/retired/claude-opus-5-5/create/new-all-g1/cli-startup and new-all-g2/deliver-on-create, both at the base commit).

## non-goals

- Changing deliver for implement or review units.
- Changing review entry's missing-declared-files check: it is right for implementation units.

## slices

- global_gate: type

### S1 — Deliver publishes a create unit as publish --kind=create does
- **Status**: pending
- **Files**: `packages/cli/src/lib/work-deliver.service.ts`, `packages/cli/src/lib/work-deliver.service.spec.ts`, `packages/cli/src/contracts/interfaces/work-deliver.interface.ts`, `packages/cli/src/commands/work.command.ts`
- **Gate**: type
- acceptance:
  - "When the located unit's work ref is of kind create, `deliverUnit` makes no proposal transition: it proves and then publishes the unit through a `publish` port that runs `work publish --kind=create` for that unit, and answers with that publication."
  - "If the proof fails, nothing is committed and nothing is published."
  - "work-deliver.service.spec.ts proves both: no transition port call for a create unit, the publish port called once after a green proof, and neither after a red one; implement units keep today's order (in-progress, prove, review)."

### S2 — Publishing one create unit never retires another
- **Status**: pending
- **Files**: `packages/core/src/lib/work-units/unit-ref-rename.service.ts`
- **Gate**: type
- acceptance:
  - "Find which step retires an agent's other `new-all-g<n>` create unit while a renamed create unit publishes, and make it match the unit by its full name (topic included); a spec proves two create units of one agent, one published, leave the other live."

## acceptance

- When the located unit's work ref is of kind create, `deliverUnit` makes no proposal transition: it proves and then publishes the unit through a `publish` port that runs `work publish --kind=create` for that unit, and answers with that publication.
- If the proof fails, nothing is committed and nothing is published.
- work-deliver.service.spec.ts proves both: no transition port call for a create unit, the publish port called once after a green proof, and neither after a red one; implement units keep today's order (in-progress, prove, review).
- Find which step retires an agent's other `new-all-g<n>` create unit while a renamed create unit publishes, and make it match the unit by its full name (topic included); a spec proves two create units of one agent, one published, leave the other live.
