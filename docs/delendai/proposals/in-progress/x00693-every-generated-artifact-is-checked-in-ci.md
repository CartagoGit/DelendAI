---
id: x00693
title: "Every generated artifact is checked in CI"
kind: fix
status: in-progress
type: proposal
track: trust
date: 2026-09-27
priority: P1
related: [x00541]
---

# x00693 — Every generated artifact is checked in CI

## goal

The public API inventory says what the barrel publishes. Every artifact
`gen:all` can check is checked in CI, from `gen:all`'s own list.

## why

An external review of develop at `66840ab84` found
`docs/delendai/CORE-PUBLIC-API-INVENTORY.md` reporting 402 exports while
`core-public-surface-budget` counted 645. Some of its rows were named
after comments, and `generated-artifacts-check` was green.

- **Nothing regenerated the inventory.** Its generator reads the same
  `parseBarrel` as the budget and the consumer lint, but no step wrote
  the file. Before x00541's cut it said 747 while the barrel had 1080,
  and the cut edited it by hand.
- **CI checks a second list.** CI's `check:generated` names its own few
  artifacts. Seven `gen:all` generators with a `--check` never ran in
  CI: `config-schema`, `plugin-catalog-docs`, `core-public-inventory`,
  `provenance-truth`, `init-skill-inventory`, `authorities` and
  `host-hints`. Only the local pre-push ran `gen:all --check`, so CI
  green and a clean pre-push could disagree.

## why this design

- **One parser.** The inventory is written by `gen:all` from the
  `parseBarrel` projection the budget and the consumer lint already use.
  Its count cannot differ from the budget's.
- **One list.** `check:generated` runs the check command of every
  `gen:all` step it does not already check itself. A generator
  registered in `gen:all` is checked in CI with nothing else to edit.
  Measured steps keep their own gate.

## non-goals

- Changing any generator's output.

## architecture

- `tools/scripts/inspect/core-public-inventory.script.ts`: `--write` and
  `--check` on `INVENTORY_PATH`.
- `tools/scripts/gen-all.script.ts`: the `core-public-inventory` step.
- `tools/scripts/lint/check-generated-artifacts.script.ts`: runs the
  remaining `gen:all` checks.

## Slices

- global_gate: none

### S1 — The inventory is generated and every generated artifact is checked

- **Status**: in-progress
- **Gate**: `bun run check:generated`
- **Files**:
  - `tools/scripts/inspect/core-public-inventory.script.ts`
  - `tools/scripts/gen-all.script.ts`
  - `tools/scripts/lint/check-generated-artifacts.script.ts`
  - `docs/delendai/CORE-PUBLIC-API-INVENTORY.md`

## dependency graph

None.

## acceptance

- The inventory states 645 exports, matching the budget, and no row is
  named after a comment.
- `check:generated` fails with `CORE-PUBLIC-INVENTORY: drift detected`
  when the inventory's total is edited to 402, and passes on the
  generated file.
