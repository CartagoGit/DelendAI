---
id: x00698
title: "The owner's identity comes from the global config"
kind: fix
status: done
type: proposal
track: trust
date: 2026-09-27
priority: P0
related: [f00644, x00688]
last-transition-id: dfb188ac-775b-4087-ad50-e875f30fdf14
last-correlation-id: dfb188ac-775b-4087-ad50-e875f30fdf14
last-transition-from: in-progress
---

# x00698 — The owner's identity comes from the global config

## goal

A commit on delendai's branches is authored as the repository owner,
whatever an agent writes into the repository's shared git config.

## why

On 2026-09-27 an agent ran `git config user.name delendai-impl-minimax-3`
(and `user.email delendai@MiniMax.local`) in this repository.
`.git/config` is shared by every worktree, so from then on every agent
committed as MiniMax: Claude's x00694, x00696 and x00697 and GLM's
review closes all read `delendai-impl-minimax-3`. Attribution was
wrecked, and with it the implementer-reviewer independence that
attribution feeds.

The guard's borrowed-author rule compared a commit's author with "the
configured identity". It read that identity from the repository's own
config, so the rewritten config became the correct identity and the rule
passed.

## why this design

- **The owner is the global identity.** The guard reads `user.name` and
  `user.email` from the global config, then the system config, and only
  without either from the repository. A repository-level identity that
  differs from the owner's is exactly a borrowed author, and on
  delendai's branches it is refused with the owner's identity named.
- **Tests carry their own global config.** The real-git cases get a
  `GIT_CONFIG_GLOBAL` naming the test owner and no system config, so the
  machine running the suite lends nothing.

## non-goals

- Rewriting the history already authored as MiniMax.

## architecture

- `packages/cli/src/commands/guard.command.ts`:
  `defaultGuardFacts.configuredAuthor`.
- `packages/cli/src/commands/guard.command.spec.ts`: a hermetic git
  config, and the incident as a case.

## Slices

- global_gate: none

### S1 — The owner's identity is not the repository's to change

- **Status**: review
- **Gate**: `npx vitest run packages/cli/src/commands/guard.command.spec.ts`
- **Files**:
  - `packages/cli/src/commands/guard.command.ts`
  - `packages/cli/src/commands/guard.command.spec.ts`

## dependency graph

None.

## acceptance

- With the owner `Guard <guard@example.com>` in the global config and
  `delendai-impl-minimax-3` written into the repository config, a commit
  on a delendai work branch is refused, naming the owner.
