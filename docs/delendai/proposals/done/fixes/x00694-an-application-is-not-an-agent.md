---
id: x00694
title: "An application is not an agent"
kind: fix
status: done
type: proposal
track: trust
date: 2026-09-27
priority: P1
related: [f00644, x00688]
last-transition-id: 5ebcb1a4-8447-4985-a647-96f85a7d9afa
last-correlation-id: 5ebcb1a4-8447-4985-a647-96f85a7d9afa
last-transition-from: review
shipped-in:
  - "ea9112997a4efbd655bff58a64d88017a957a4c5"
---

# x00694 — An application is not an agent

## goal

The agent segment of every work ref names the model that does the work,
never the program it runs in.

## why

On 2026-09-27 a swarm of reviewers started. One of them entered
`delendai/wip/copilot/review/batch-all-g1/close-the-ready-review-batches`.
Copilot is the VS Code extension the agent runs in; the agent was GLM or
MiniMax, and nothing in the ref says which. The owner saw at once that it
was wrong. Nothing refused it: the only checks on the agent segment were
lower case and "does not spell a kind of work".

## why this design

- **One list of programs.** `HOST_APPLICATION_IDS` in
  `profiles.constant.ts` names the programs agents run in: Copilot,
  VS Code, Claude Code, Cursor, Cline, Roo, Kilo, Codex CLI, Gemini CLI
  and so on. It is compared against the whole agent id, so a model called
  `gpt-5-codex` is not mistaken for the `codex` program.
- **Refused wherever an agent id is judged.** `work enter`, the guard
  (for any host creating the ref) and CI's `pr-head-shape` use
  `isHostApplicationId` beside `kindsInAgentId`, and each says to declare
  the model instead.

## non-goals

- Guessing the model from the host. The agent declares it.

## architecture

- `packages/core/src/lib/development-policy/profiles.constant.ts`:
  `HOST_APPLICATION_IDS`.
- `packages/core/src/lib/development-policy/work-ref-placeholders.ts`:
  `isHostApplicationId`.
- `packages/core/src/lib/development-policy/git-guard-shape.ts`,
  `packages/cli/src/commands/work.command.ts`,
  `tools/scripts/lint/pr-head-shape.script.ts`: the refusal.
- `packages/core/src/cli.ts`: the export.

## Slices

- global_gate: none

### S1 — Programs are refused as agent ids

- **Status**: done
- **Gate**: `npx vitest run packages/core/tests/src/lib/development-policy/git-guard.spec.ts packages/cli/src/commands/work.command.spec.ts tools/scripts/lint/pr-head-shape.script.spec.ts`
- **Files**:
  - `packages/core/src/lib/development-policy/profiles.constant.ts`
  - `packages/core/src/lib/development-policy/work-ref-placeholders.ts`
  - `packages/core/src/lib/development-policy/git-guard-shape.ts`
  - `packages/core/src/cli.ts`
  - `packages/cli/src/commands/work.command.ts`
  - `tools/scripts/lint/pr-head-shape.script.ts`
  - `packages/core/tests/src/lib/development-policy/git-guard.spec.ts`
  - `packages/cli/src/commands/work.command.spec.ts`
  - `packages/cli/src/commands/guard.command.spec.ts`
  - `tools/scripts/lint/pr-head-shape.script.spec.ts`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-3
- review-log: approved by minimax-3 — Independiente: implementer claude-opus-5-5, reviewer minimax-3. Verifiqué ea9112997a. PR MERGED. Programs are refused as agent ids
## dependency graph

None.

## acceptance

- `work enter --agent=copilot`, a guard-judged `delendai/wip/copilot/…`
  and a publication `delendai/pr/copilot/…` are refused.
- `gpt-5-codex`, `minimax-m3` and `glm-5` are accepted.
