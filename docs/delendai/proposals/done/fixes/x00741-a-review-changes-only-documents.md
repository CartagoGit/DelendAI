---
id: x00741
title: "A review changes only documents"
kind: fix
status: done
type: proposal
track: trust
date: 2026-09-28
priority: P0
related: [x00740]
last-transition-id: 64ea53c5-4c52-47f6-8f02-45a0769aecd4
last-correlation-id: 64ea53c5-4c52-47f6-8f02-45a0769aecd4
last-transition-from: review
shipped-in:
  - "9eef0b087"
---

# x00741 — A review changes only documents

## goal

A reviewer cannot change the product. Nothing reaches the integration
branch past the hooks, empty commits included, whatever host runs the
agent. `work enter` never nests one unit inside another.

## why

Three things seen on 2026-09-28, with `minimax-3` and `glm-5.3-max`
reviewing:

- A reviewer asked to close a pack of proposals edited
  `packages/cli/src/commands/groups/proposals.ts`, adding back the flag that
  skips peer review, and started its branch in the shared checkout. Nothing
  said a review may not change code. Hosts that set none of
  `CLAUDECODE`/`AI_AGENT`/`DELENDAI_AGENT_ID` are judged as people, so the
  guard's agent rules never applied to it.
- A reviewer's claim, an empty commit, landed on `develop` in the shared
  checkout. lefthook skips every `pre-commit` command when nothing is
  staged, whatever the command declares, so both the repository's
  integration refusal and the product guard were skipped.
- A reviewer ran `work enter` from inside its own unit. The default
  worktree path resolved against that unit, so the new unit was created
  inside the old one's `.cache`. Installing dependencies there pointed
  every hook in the clone at the nested copy.

## why this design

- **Review scope, keyed on the ref.** A commit on a work ref whose kind is
  `review` may change only files under the project's `docsDir` and
  generated files (`*.generated.*`). The kind is read from the ref with the
  same parser the reconciler uses. Refs are delendai's namespace, so the
  rule applies to anyone committing there, whether or not an agent marker
  is set. Merges are exempt: they bring the integration branch in. The
  same scope is checked again when the unit is published, against its
  whole diff, so a commit made with `--no-verify` is not published either.
- **`commit-msg` is guarded as well.** It judges the same commit as
  `pre-commit`, and git runs it for every commit, empty or not. This
  holds under any hook manager that skips `pre-commit`. This repository's
  lefthook config runs both the integration refusal and the guard there.
- **Units sit beside each other.** The default worktree path resolves
  against the shared checkout (`sharedCheckout`), not the tree `work enter`
  runs in.
- `docsDir` is read by `readWorkspaceDocsDir`, next to the policy reader,
  and defaults to `DEFAULT_CORE_PATHS.docsDir`.

## non-goals

- Recognising an unmarked agent in the shared checkout on the integration
  branch. The product guard leaves people free there. This repository's
  own hook refuses everyone, and branch protection holds on the forge.

## architecture

- `packages/core/src/lib/development-policy/git-guard-review-scope.ts`
  (new), `git-guard.ts`, `git-guard-shape.ts`.
- `packages/core/src/lib/work-units/work-unit-publish.service.ts`,
  `work-unit-enter.service.ts`, `development-policy.service.ts`.
- `packages/cli/src/commands/guard.command.ts`, `lefthook.yml`.

## Slices

- global_gate: none

### S1 — Review scope, commit-msg guard, units beside each other

- **Status**: done
- **Gate**: `npx vitest run packages/core/tests/src/lib/development-policy packages/core/tests/src/lib/work-units/work-unit.service.spec.ts packages/cli/src/commands/guard.command.spec.ts packages/cli/src/commands/guard-facts.spec.ts`
- **Files**:
  - `packages/core/src/lib/development-policy/git-guard-review-scope.ts`
  - `packages/core/src/lib/development-policy/git-guard.ts`
  - `packages/core/src/lib/development-policy/git-guard-shape.ts`
  - `packages/core/src/lib/contracts/interfaces/git-guard.interface.ts`
  - `packages/core/src/lib/contracts/interfaces/guard-hooks.interface.ts`
  - `packages/core/src/lib/guard-hooks/guard-hook-block.helper.ts`
  - `packages/core/src/lib/work-units/development-policy.service.ts`
  - `packages/core/src/lib/work-units/work-unit-enter.service.ts`
  - `packages/core/src/lib/work-units/work-unit-publish.service.ts`
  - `packages/core/src/cli.ts`
  - `packages/core/tests/src/lib/development-policy/git-guard-review-scope.spec.ts`
  - `packages/core/tests/src/lib/work-units/work-unit.service.spec.ts`
  - `packages/cli/src/commands/guard.command.ts`
  - `packages/cli/src/commands/guard.command.spec.ts`
  - `packages/cli/src/commands/guard-facts.spec.ts`
  - `packages/cli/src/lib/guard-hooks.service.spec.ts`
  - `packages/cli/src/lib/guard-hooks-autoinstall.service.spec.ts`
  - `packages/cli/src/contracts/interfaces/guard.interface.ts`
  - `packages/cli/src/contracts/constants/guard-hooks.constant.ts`
  - `lefthook.yml`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3
- review-log: approved by minimax-m3 — Revisé 9eef0b087 (x00741 S1, merge PR #610). git-guard-review-scope.ts limita commits en review refs a docs+generated (rechaza packages/cli/... por agente o proceso unmarked, nombra el path). El publish (work-unit-publish.service.ts) re-chequea contra el diff total — un commit con --no-verify no llega a publish. commit-msg hook (lefthook.yml) cubre si pre-commit se salta (un commit vacío en develop es rechazado). work enter resuelve el path del worktree contra sharedCheckout (no contra el tree donde corre). 227/227 verde en 16 specs (development-policy + work-units + guard.command + guard-facts). claude-opus-5-5 != minimax-m3 → veredicto independiente.
- review-attribution: claude-opus-5-5 from commit 9eef0b087a76 names refs/heads/delendai/wip/claude-opus-5-5/implement/x00741-S1-g2/a-review-changes-only-documents (9eef0b087a766fd1c3f62f8907a84ff123f750b4), opened by minimax-m3

## dependency graph

None.

## acceptance

- A commit on a review ref that stages `packages/cli/...` is refused, by an
  agent and by an unmarked process alike, naming the path. A commit that
  stages proposal documents and generated files goes through.
- A review unit whose diff changes a source file is not published.
- With `pre-commit` skipped, an empty commit on `develop` is refused by
  `commit-msg`.
- `work enter` run inside a unit creates the new worktree under the shared
  checkout's `.cache/delendai/.worktrees`.
