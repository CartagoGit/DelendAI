---
id: f00799
title: "the context an agent receives is the size of its task"
kind: feat
status: in-progress
type: proposal
track: tokens
date: 2026-11-01
last-transition-id: 197942f1-4d4f-4f05-8bf7-c1a929bf582c
last-correlation-id: 197942f1-4d4f-4f05-8bf7-c1a929bf582c
last-transition-from: ready
last-transition-at: 2026-11-01T18:36:31.061Z
---

# f00799 — the context an agent receives is the size of its task

## goal

Every unit starts with what its task needs, two lines or hundreds of files, chosen by delendai from the slice and not by a fixed cap, so an agent neither searches for what was known nor stops short of what the work requires.

## why

A host keeps what it received, and delendai cannot take anything back out of a model's context. What delendai does decide is what goes in, and today it decides badly at both ends:

- `work enter` is the one call every task passes through, and its briefing says only what other agents are doing: not the slice's goal, files, acceptance or nearest specs. Each agent rebuilds that with searches; a measured session spent 91% of 46 MB in Bash, over half of it reading code.
- `context_for_change` cuts at a fixed 3,000 bytes whatever the task, and `proposals_compile_context` shows no call in 7,960. `context-compiler`, `impact-analysis` and durable memory exist and are not on the path of the work.
- `AGENT-BOOTSTRAP.md` is 31,860 bytes read every session, and 6,769 of them are appendices for hosts other than the one reading them.
- Skill bodies are lazy, yet one that ran stays in context for the rest of the session.

A shorter answer that sends the agent back for more spends more. The measure of this proposal is tokens per finished task and rework, not bytes per response.

## non-goals

- Removing anything a host already holds: no MCP server can.
- A fixed byte budget for a task: the slice decides.
- Cutting context a task needs to reach a figure: a task that fails or is reworked counts against it.

## slices

- global_gate: type

### S1 — A unit starts with its task
- **Status**: pending
- **Files**: `packages/cli/src/commands/work.command.ts`, `packages/core/src/cli.ts`, `packages/core/src/contracts/index.ts`, `packages/core/src/lib/contracts/interfaces/work-briefing.interface.ts`, `packages/core/src/lib/work-units/task-briefing.service.ts`, `packages/core/src/lib/work-units/work-unit-enter-briefing.service.ts`, `packages/core/src/lib/work-units/work-unit-enter.service.ts`, `packages/core/tests/src/lib/work-units/task-briefing.service.spec.ts`, `plugins/proposals/src/index.ts`, `plugins/proposals/src/lib/services/task-briefing.service.ts`, `plugins/proposals/src/public/index.ts`, `plugins/proposals/tests/src/lib/services/task-briefing.service.spec.ts`, `packages/cli/src/commands/work-briefing.spec.ts`
- **Gate**: type
- acceptance:
  - "Through a port core declares and the proposals plugin fills, `work enter` returns the slice's goal, acceptance, files with their sizes and nearest specs, by reference and not by body; a project with no proposals plugin enters as before."

### S2 — Context scales with the change
- **Status**: pending
- **Files**: `plugins/context-for-change/src/lib/services/context-for-change.service.ts`, `plugins/context-for-change/src/lib/services/context-for-change-format.service.ts`
- **Gate**: type
- acceptance:
  - "`context_for_change` takes its reach from what it was given: a symbol returns that symbol's lines, a slice of many files returns all of them; anything left out is named with how to get it, and no fixed cap decides silently."

### S3 — The always-read rules are the rules this host needs
- **Status**: pending
- **Files**: `docs/delendai/AGENT-BOOTSTRAP.md`
- **Gate**: type
- acceptance:
  - "A host reads only its own appendix, and rules that apply to one activity load with that activity; the always-read part has a measured budget a gate holds, and no rule is lost."

### S4 — A self-contained playbook runs apart
- **Status**: pending
- **Files**: `packages/core/src/lib/contracts/constants/agent-hosts.constant.ts`, `plugins/audit/skills/delendai-audit-playbook/SKILL.md`
- **Gate**: type
- acceptance:
  - "On a host that can run a skill in its own context, a long self-contained skill does so and only its result reaches the main thread; a host that cannot reads it as before."

### S5 — The saving is measured per finished task
- **Status**: pending
- **Files**: `plugins/usage-tracking/src/index.ts`
- **Gate**: type
- acceptance:
  - "Usage reports tokens per finished unit, with reads, retries and failed proofs, so a change that shrinks a response and adds rework shows as a loss."

## acceptance

- An agent entering a slice has its task without a search, by reference.
- Reach follows the change, from one symbol to hundreds of files, and nothing is cut silently.
- Each host reads only its own always-read rules, under a gated budget, with no rule lost.
- A long self-contained skill leaves only its result where the host allows it.
- Tokens per finished unit are reported, including rework.

## notes
- 2026-11-01: the owner made the right path a standing rule for every agent, so it opens the invariants of AGENT-BOOTSTRAP.md, ahead of the split of S3.
- 2026-11-02, S1: `work enter` answers with the task in about 2 KB. The CLI reads proposals from the default layout, so a project with a relocated folder gets the task through its server, and no task block from the CLI.
