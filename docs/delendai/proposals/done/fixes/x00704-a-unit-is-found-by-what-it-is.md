---
id: x00704
title: "A unit is found by what it is"
kind: fix
status: done
type: proposal
track: trust
date: 2026-09-27
priority: P1
related: [f00644, x00553, x00695]
last-transition-id: f8d5fd04-dc4f-4622-ac2a-3ef9b9ae4cd8
last-correlation-id: f8d5fd04-dc4f-4622-ac2a-3ef9b9ae4cd8
last-transition-from: review
shipped-in:
  - "44ac41ad8bd24c1e11ee13dde3a7af2096e3843e"
---

# x00704 — A unit is found by what it is

## goal

`work publish`, `work checkpoint` and `work enter` find an agent's unit
by its identity: agent, proposal, slice and generation. The kind and
topic it was entered under only name it, so they are not needed to find
it again.

## why

A swarm on 2026-09-27 left wips on origin that never became pull
requests. `work publish` without the `--topic` (or `--kind`) the unit
was entered with renders `…/implement/…/work`. It finds nothing and
reports `resolve-work-ref: … does not exist`. The agent's work is intact,
but no command reaches it, and the agent moves on. `checkpoint` in the
same situation starts a second copy of the unit under the default name.

## why this design

- **One ref of the unit is that unit.** When the rendered name does not
  exist, the unit's refs are listed with kind and topic open, but only
  where the arguments did not name them. If there is exactly one, it is
  used.
- **Two refs are refused, not guessed.** When several exist, the command
  names them and asks for `--kind`/`--topic`. Picking one could publish
  the wrong work; rendering a new name would duplicate the unit.

## non-goals

- Changing the ref shape, or the legacy no-kind lookup (f00644).

## architecture

- `packages/cli/src/commands/work.command.ts`: `unitRefsAnyName`,
  `ambiguousUnit`; `existingWorkRef` uses the unique match.

## Slices

- global_gate: none

### S1 — Publish reaches the unit

- **Status**: done
- **Gate**: `npx vitest run packages/cli/src/commands/work.command.spec.ts`
- **Files**:
  - `packages/cli/src/commands/work.command.ts`
  - `packages/cli/src/commands/work.command.spec.ts`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-3
- review-log: approved by minimax-3 — Independiente: implementer claude-opus-5-5, reviewer minimax-3. Verifiqué 44ac41ad8bd24c1e11ee13dde3a7af2096e3843e. PR MERGED. Publish reaches the unit
## dependency graph

None.

## acceptance

- A review batch entered with `--kind=review --topic=sweep` publishes
  with only `--proposal --slice --agent`. Without the fix it fails.
- Two refs of one unit refuse the publish, name both, and leave both.
