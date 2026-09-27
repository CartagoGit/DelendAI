---
id: x00687
title: "Work that exists nowhere else cannot be deleted"
kind: fix
status: in-progress
type: proposal
track: trust
date: 2026-09-27
priority: P0
related: [x00685, f00644]
---

# x00687 — Work that exists nowhere else cannot be deleted

## goal

A push that deletes a branch in delendai's namespaces is refused when no
other ref holds the commits it would delete. This holds for whoever runs
git.

## why

On 2026-09-26, five MiniMax work refs (`delendai/wip/minimax-m3/…`)
were deleted from the forge. None of their checkpoints was contained in
the integration branch or any other ref. The next boot found them gone,
reported `integration-evidence.ref-vanished` five times, and went
DEGRADED with mutations blocked for every agent on the machine. Two
things let it through:

- **The guard allowed every branch deletion,** on the premise that
  "removing a branch never loses integrated work". A work ref's
  unintegrated commits are exactly what it can lose.
- **The agent rules apply only when an agent marker is set.** Those are
  `DELENDAI_AGENT_ID`, `AI_AGENT` and `CLAUDECODE`, and only Claude Code
  sets one by itself. A runtime that sets none is judged as a person, so
  every agent rule is skipped.

## why this design

- **The guard is told what the deletion loses.** The pre-push hook reads
  the deleted tip from git's stdin, and the CLI asks git whether another
  ref holds it: the integration branch, a publication, or another work
  ref. The deleted branch's own names, local and remote-tracking, do not
  count. A commit unknown locally leaves the answer unknown and the push
  is allowed.
- **Judged by namespace, not by who runs git.** Inside delendai's
  namespaces the refs belong to the work model, so the refusal applies
  to a process with no agent marker too, like the shape rules of f00644.
  Outside them a person deletes what they like. A person who means to
  discard work in the namespaces pushes with `--no-verify`.

## non-goals

- Recognising agents that set no marker everywhere. Tracked separately.

## architecture

- `packages/core/src/lib/contracts/interfaces/git-guard.interface.ts`:
  `deletedTipKept`.
- `packages/core/src/lib/development-policy/git-guard-shape.ts`:
  `refuseLosingDeletion`, also applied in `judgeNamespaceShape`.
- `packages/core/src/lib/development-policy/git-guard.ts`: `judgePush`
  uses it.
- `packages/cli/src/commands/guard.command.ts`: reads the deleted tip;
  `defaultGuardFacts.tipKept`.
- `packages/cli/src/contracts/interfaces/guard.interface.ts`: `tipKept`.

## Slices

- global_gate: none

### S1 — Deleting unkept work is refused

- **Status**: in-progress
- **Gate**: `npx vitest run packages/core/tests/src/lib/development-policy/git-guard.spec.ts packages/cli/src/commands/guard.command.spec.ts`
- **Files**:
  - `packages/core/src/lib/contracts/interfaces/git-guard.interface.ts`
  - `packages/core/src/lib/development-policy/git-guard-shape.ts`
  - `packages/core/src/lib/development-policy/git-guard.ts`
  - `packages/cli/src/commands/guard.command.ts`
  - `packages/cli/src/contracts/interfaces/guard.interface.ts`
  - `packages/core/tests/src/lib/development-policy/git-guard.spec.ts`
  - `packages/cli/src/commands/guard.command.spec.ts`

## dependency graph

None.

## acceptance

- Deleting a work branch whose tip no other ref holds is refused, for an
  agent and for a process with no marker. Kept and unknown tips are
  allowed.
- Deleting a branch outside the namespaces is never refused for a person.
- Against a real repository, the tip is not kept when only the deleted
  branch holds it, and is kept once a publication ref holds it.
