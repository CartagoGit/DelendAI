---
id: x00699
title: "An agent session holds its unit"
kind: fix
status: done
type: proposal
track: trust
date: 2026-09-27
priority: P0
related: [x00688, x00695]
last-transition-id: 6e7513f6-3335-4ca2-a2e0-37f5f0870932
last-correlation-id: 6e7513f6-3335-4ca2-a2e0-37f5f0870932
last-transition-from: review
shipped-in:
  - "c75f74dd98a2cab1350f57253eecde50a99af72b"
---

# x00699 — An agent session holds its unit

## goal

Two running instances of one model never share a unit of work. Each
`work enter` issues a session; a unit already held in a worktree is
entered again only by the session holding it.

## why

The owner ran four MiniMax instances and one GLM as a review swarm on
2026-09-27. The four MiniMax instances worked as one agent id, three as
`minimax-3` and one as `copilot`, and none as the model id `minimax-m3`.
`work enter` returned an existing unit's worktree to whoever named it,
so instances took over each other's units. The branches no longer said
who had done what, and whether two instances had done the same work
could not be told.

The work ref names the model, by design (f00644, x00694). Nothing named
the instance.

## why this design

- **The session is issued, not guessed.** `work enter` returns a
  `session` (and prints it). It is taken from `--session` or
  `DELENDAI_SESSION_ID`, or issued on the first entry. It is written into
  the worktree's stamp beside the agent (x00688).
- **A held unit is entered only by its session.** Entering a unit whose
  worktree records another session, or entering it with no session, is
  refused. The refusal says to pass one's own session, or to enter one's
  own unit with a different topic or the next generation. A worktree
  stamped before sessions existed is claimed by the first session that
  enters it.

## non-goals

- Checking that an agent id is a real model name. Nothing can list every
  model; x00694 refuses the program names.

## architecture

- `packages/core/src/lib/work-units/worktree-agent.service.ts`: the stamp's second
  line, `worktreeSession`.
- `packages/cli/src/commands/work.command.ts`: `sessionFor`,
  `heldByAnother`, `claimWorktree` in `work enter`.
- `packages/cli/src/contracts/interfaces/work-briefing.interface.ts`: the
  entered unit's `session`.

## Slices

- global_gate: none

### S1 — A unit is held by the session that entered it

- **Status**: done
- **Gate**: `npx vitest run packages/cli/src/commands/work.command.spec.ts`
- **Files**:
  - `packages/core/src/lib/work-units/worktree-agent.service.ts`
  - `packages/cli/src/commands/work.command.ts`
  - `packages/cli/src/contracts/interfaces/work-briefing.interface.ts`
  - `packages/core/tests/src/lib/work-units/work-unit.service.spec.ts`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-3
- review-log: approved by minimax-3 — Independiente: implementer claude-opus-5-5, reviewer minimax-3. Verifiqué c75f74dd98. PR MERGED. A unit is held by the session that entered it
## dependency graph

x00695 (the same `work enter`), merged into this unit.

## acceptance

- Entering a unit returns a session. Entering it again with that session
  returns the same worktree.
- Entering it with no session, or with another session, is refused as
  held by another session.
