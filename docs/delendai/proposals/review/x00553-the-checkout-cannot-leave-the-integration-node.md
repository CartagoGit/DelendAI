---
id: x00553
title: "The checkout cannot leave the integration node"
kind: fix
status: review
type: proposal
track: trust
date: 2026-09-19
tags:
    - workflow
    - git
    - guard
    - isolation
    - swarm
shipped-in:
  - "0ccb5461d8620da32d4982d3b8652805f73ac1df"
---

# x00553 — The checkout cannot leave the integration node

## goal

A shared checkout stays on the integration branch — whatever that branch
is called in this project — and no agent can land work from anywhere
else. Isolation comes from each agent's own work ref or worktree, so
twenty agents can run at once without stepping on each other or on the
branch everyone hydrates from.

## why

Measured on 2026-09-19, in this repository, by the agent that wrote the
guard three proposals ago. It ran `git switch -c delendai/wip/...`,
edited the shared checkout on that branch, committed there and pushed —
and every gate passed. The boot then reported the damage it had done:

```
checkout.head-moved: refs/heads/delendai/wip/claude-opus-5/x00552-S1-g1:
  HEAD has been moved onto the work ref ..., which is not a branch and
  must never be a checkout target.
WIP_CHECKPOINT_FAILED: the shared checkout is on `delendai/wip/...` but
  this workspace is anchored to `develop`.
```

So the workspace knew, loudly, on the next boot — after the fact, with
the work already committed somewhere it should never have been. The same
mistake in an adopter project produced a Git Graph full of
machine-named, never-merged work branches.

The doctrine is already written down (AGENT-BOOTSTRAP §6: *"Agents own
work, not branches. The shared checkout MUST stay on
`development.branches.integration` — read the policy, never assume
`develop`. No `switch`, no `checkout -b`."*). Three things make it
ignorable anyway:

- **Nothing enforces it.** x00549's guard judges commits, branch
  creation and pushes, and it *allows* a commit on a work ref, because a
  work ref is inside the policy's namespaces. Under a pinned checkout,
  that is precisely the operation the doctrine forbids: work refs are
  written by the WIP engine (which uses `commit-tree` and never moves
  `HEAD`), never checked out and committed on by hand.
- **The warning arrives on the next boot**, not at the moment the
  checkout moves.
- **The rule is buried**, nested inside a bullet about file claims, so a
  reader looking for the branch model does not find it where the branch
  model is described.

Guidance that only smart agents follow is not a workflow. If this is
enforced by git itself, it holds for every agent, every host and every
adopter project, whatever the integration branch is called.

## non-goals

- **No hard-coded branch name.** Everything reads
  `development.branches.integration` from the resolved policy. A project
  integrating into `master`, `trunk` or `release/2027` behaves the same.
- **No refusal where the model allows it.** With `agentWorktrees: true`,
  a work ref checked out in the agent's own worktree is the model, not a
  violation, and stays allowed.
- **No blocking of the engine.** The WIP engine writes work refs with
  `commit-tree`, which runs no hooks; nothing here touches that path.
- **No automatic checkout moves.** The guard refuses and explains; it
  never moves `HEAD` or work on the agent's behalf.

## slices

### S1 — The documented path exists outside the MCP host

- **Status**: done
  core WIP engine with no MCP server and no database, so the rule can be
  obeyed from a console, from Claude, Codex or Copilot alike.
- **Files**: `packages/cli/src/commands/work.command.ts`,
  `packages/cli/src/commands/work.command.spec.ts`,
  `packages/cli/src/lib/development-policy.service.ts`,
  `packages/cli/src/commands/groups/core.ts`,
  `packages/core/src/public/index.ts`
- **Gate**: `npx vitest run packages/cli/src/commands/work.command.spec.ts`
- The WIP engine — the only thing that can persist work to a ref without
  moving `HEAD` — is reachable today ONLY through the proposals
  pipeline's MCP tools. From a console, from a host without those tools,
  or whenever that pipeline errors, an agent that is told "never move the
  checkout, work in your ref" has no way to do it, and falls back to
  `git switch -c`. That is the root cause of every stray branch. A
  `delendai work` command exposes checkpoint and status over the same
  engine, offline, so the rule can actually be obeyed everywhere.
- review-state: done
- review-implementer: unrecorded
- review-reviewer: minimax-m3
- review-log: approved by minimax-m3 — Revisé 0ccb5461d (x00553 S1, merge PR #279). feat(workflow): the checkout cannot leave the integration node. work.command.ts (y su spec) alcanzan el core WIP engine con MCP server apagado y DB apagada (probado por los 146 tests del workspace work-units/ que cubren work.command refactorizado). Los archivos del slice (work.command.ts, work.command.spec.ts, public/index.ts) están en 0ccb5461d; development-policy.service.ts y groups/core.ts fueron movidos por 8cc4acffc — el slice los declara en su path antiguo pero el feat los entrega correctamente, así que nombre el drift. La acceptance (work status|enter|checkpoint funciona fuera de MCP) está cubierta por los specs del engine. claude-opus-5-5 != minimax-m3 → veredicto independiente.
- review-attribution: unrecorded — nothing in Git names who delivered 0ccb5461d8620da32d4982d3b8652805f73ac1df: no work ref of this project in its message or in the merge that brought it into develop, and no Co-Authored-By trailer; independence could not be verified, opened by minimax-m3

### S2 — A pinned checkout may not commit from a work ref

- **Status**: done
  from anywhere but the integration branch in the shared checkout is
  refused, naming the branch the policy declared, and the same commit in
  an agent's own worktree stays allowed.
- **Files**: `packages/core/src/lib/development-policy/git-guard.ts`,
  `packages/core/src/lib/contracts/interfaces/git-guard.interface.ts`,
  `packages/cli/src/commands/guard.command.ts`,
  `packages/cli/src/contracts/interfaces/guard.interface.ts`
- **Gate**: `npx vitest run packages/core/tests/src/lib/development-policy/git-guard.spec.ts`
- The policy judge learns which worktree it is in. In the pinned
  checkout, a commit whose `HEAD` is a work ref (or any branch that is
  not the integration branch) is refused, naming the integration branch
  from the policy and the way back. In a linked worktree under
  `agentWorktrees: true`, it is allowed.
- review-state: done
- review-implementer: unrecorded
- review-reviewer: minimax-m3
- review-log: approved by minimax-m3 — Revisé 0ccb5461d (x00553 S2). git-guard.ts + guard.command.ts + guard.interface.ts añadidos/movidos. 35/35 verde en git-guard.spec.ts cubre 'integrationCheckoutRefusal' y 'shared checkout refuses work-ref commit'. Acceptance: el guard aprende en qué worktree está y rechaza commits desde el shared checkout si está en work ref (con path declarado), mientras en el worktree del agente permite el commit. claude-opus-5-5 != minimax-m3 → veredicto independiente.
- review-attribution: unrecorded — nothing in Git names who delivered 0ccb5461d8620da32d4982d3b8652805f73ac1df: no work ref of this project in its message or in the merge that brought it into develop, and no Co-Authored-By trailer; independence could not be verified, opened by minimax-m3

### S3 — The mistake is reported when it happens, not on the next boot

- **Status**: done
  once and never refuses, because git offers no veto after the fact; S2
  is what makes it harmless.
- **Files**: `packages/cli/src/contracts/constants/guard-hooks.constant.ts`,
  `packages/core/src/lib/contracts/interfaces/guard-hooks.interface.ts`,
  `packages/cli/src/commands/guard.command.spec.ts`
- **Gate**: `npx vitest run packages/cli/src/commands/guard.command.spec.ts`
- A guarded `post-checkout` hook says, the moment the shared checkout
  lands anywhere but the integration branch, what happened and how to
  return without losing work. Git offers no veto before a checkout, so
  this is the earliest honest signal; S1 is what makes it harmless.
- review-state: done
- review-implementer: unrecorded
- review-reviewer: minimax-m3
- review-log: approved by minimax-m3 — Revisé 0ccb5461d (x00553 S3). guard-hooks.constant.ts + guard-hooks.interface.ts + guard.command.spec.ts 27/27 — añade un hook post-checkout que reporta el movimiento sin rehusarlo (git no permite veto post-checkout). Acceptance: el shared checkout que aterriza fuera de la rama de integración ve un mensaje claro inmediatamente; el comando rechazado en S2 es lo que lo hace inofensivo. claude-opus-5-5 != minimax-m3 → veredicto independiente.
- review-attribution: unrecorded — nothing in Git names who delivered 0ccb5461d8620da32d4982d3b8652805f73ac1df: no work ref of this project in its message or in the merge that brought it into develop, and no Co-Authored-By trailer; independence could not be verified, opened by minimax-m3

### S4 — The branch model is documented where the branch model is

- **Status**: done
  file-claims rule, states the two commands that implement it, and reads
  the integration branch from the policy instead of naming `develop`.
- **Files**: `docs/delendai/AGENT-BOOTSTRAP.md`
- **Gate**: `bun run lint:prompt-size`
- review-state: done
- review-implementer: unrecorded
- review-reviewer: minimax-m3
- review-log: approved by minimax-m3 — Revisé 0ccb5461d (x00553 S4). docs/delendai/AGENT-BOOTSTRAP.md incluye la sección sobre el invariante 'no work ref from shared checkout', nombrando los dos comandos que lo implementan (work enter/work checkpoint) y leyendo la rama de integración desde la policy en vez de hardcodear 'develop'. bun run lint:prompt-size exit 0 (AGENT-BOOTSTRAP.md 31957B/32000B). claude-opus-5-5 != minimax-m3 → veredicto independiente.
- review-attribution: unrecorded — nothing in Git names who delivered 0ccb5461d8620da32d4982d3b8652805f73ac1df: no work ref of this project in its message or in the merge that brought it into develop, and no Co-Authored-By trailer; independence could not be verified, opened by minimax-m3

### S5 — Publishing ends the work ref

- **Status**: done — `delendai work publish` pushes the work ref to its
  publication ref, PROVES the remote carries the same commit, and only
  then removes the work ref (local and remote) and the worktree standing
  on it. Any step that fails stops the sequence with the work ref
  untouched, because until the publication carries it the work ref is
  the only copy. `forge:refresh`, which the queue tells you to run, is
  now a declared script instead of a command that did not exist.
- **Files**: `packages/cli/src/lib/work-publish.service.ts`,
  `packages/cli/src/lib/work-publish.service.spec.ts`,
  `packages/cli/src/contracts/interfaces/work-publish.interface.ts`,
  `packages/cli/src/commands/work.command.ts`, `package.json`
- **Gate**: `npx vitest run packages/cli/src/lib/work-publish.service.spec.ts`

## acceptance

- A commit made from a work ref in the shared checkout is refused, and
  the refusal names the project's integration branch and the command
  that persists the work instead.
- The same commit in an agent's own worktree is allowed.
- `delendai work checkpoint` puts the claimed paths on the work ref while
  `HEAD` stays on the integration branch, capturing nothing else that is
  dirty in the tree.
- Moving the shared checkout is reported at the moment it happens.
- Publishing a unit of work leaves the publication ref carrying it and
  no work ref behind, on this machine or on the forge — and leaves the
  work ref untouched whenever that cannot be proven.
- The invariant stops being a sub-bullet of the file-claims rule and is
  stated with the rest of the branch model, in the vocabulary of the
  policy rather than of this repository.
