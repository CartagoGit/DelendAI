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
last-transition-id: 60ab56f8-f725-4734-b6f6-4f3665ef57ff
last-correlation-id: 60ab56f8-f725-4734-b6f6-4f3665ef57ff
last-transition-from: review
shipped-in:
  - "3272cdeb8"
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

- **Status**: done
- **Gate**: `npx vitest run packages/cli/src/commands/guard.command.spec.ts`
- **Files**:
  - `packages/cli/src/commands/guard.command.ts`
  - `packages/cli/src/commands/guard.command.spec.ts`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3
- review-log: approved by minimax-m3 — Revisé 3272cdeb8 (x00698 S1, merge PR #549). fix(guard): the owner's identity comes from the global config. guard.command.ts: `defaultGuardFacts.configuredAuthor` lee user.name/email del global → system → repo. Una identidad repo que difiere del owner es exactamente un borrowed author y en branches de delendai se rechaza con el nombre del owner. El spec usa GIT_CONFIG_GLOBAL hermético (sin system config). 27/27 verde en guard.command.spec.ts. claude-opus-5-5 != minimax-m3 → veredicto independiente.
- review-attribution: claude-opus-5-5 from Merge pull request #549 from CartagoGit/delendai/pr/claude-opus-5-5/implement/x00698-S1-g1/the-owner-identity-comes-from-the-global-config (refs/heads/delendai/wip/claude-opus-5-5/implement/x00698-S1-g1/the-owner-identity-comes-from-the-global-config) (3272cdeb89206146ec4bf99efabb57bfdcec9f1a), opened by minimax-m3

## dependency graph

None.

## acceptance

- With the owner `Guard <guard@example.com>` in the global config and
  `delendai-impl-minimax-3` written into the repository config, a commit
  on a delendai work branch is refused, naming the owner.
