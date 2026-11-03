---
id: q00039
title: "Plan: agents and subagents cost little on any host and any model"
kind: plan
status: ready
type: proposal
track: a00095-consistency
date: 2026-11-03
---

# q00039 — Plan: agents and subagents cost little on any host and any model

## goal

Whatever host and model a project uses, and however many agents and subagents work in it, delendai knows what each costs, measures it, and steers the work to the cheapest way that does it as well: the right thread, the right brief, the right model, and no rework.

## why

TODO: why this work matters now.

## non-goals

- TODO: what this proposal deliberately skips.

## slices

- global_gate: none

### S1 — Each host declares how it spends
- **Status**: pending
- **Files**: `packages/core/src/lib/contracts/interfaces/agent-host.interface.ts`, `packages/core/src/lib/contracts/constants/agent-hosts.constant.ts`
- **Gate**: none
- acceptance:
  - "Every host in the catalogue states how it runs subagents (and whether one starts with its own context), whether a skill can run apart, how long its prompt cache lives, how it compacts, and where its usage can be read; what is not known is stated as unknown, never guessed."

### S2 — Every host is measured
- **Status**: pending
- **Files**: `plugins/usage-tracking/src/lib/services/host-session-tokens.service.ts`
- **Gate**: none
- acceptance:
  - "usage host-sessions reads each host whose usage source S1 names (Claude Code today, then Codex, OpenCode and the others that keep one) and says plainly for a host that keeps none."

### S3 — Delegate or not, by measure
- **Status**: pending
- **Files**: `plugins/usage-tracking/src/index.ts`
- **Gate**: none
- acceptance:
  - "Asked about a task, delendai answers from the measured thread size, the host profile and the task size whether to do it in the thread or in a subagent, and on which model by the quota Batuta sees; a spec covers both answers."

### S4 — A brief is generated, not written
- **Status**: pending
- **Files**: `packages/core/src/lib/work-units/task-briefing.service.ts`
- **Gate**: none
- acceptance:
  - "An orchestrator names a proposal and slice and the subagent receives the task briefing from work enter: the files, the acceptance and the one-line flow; a brief needs no pasted context."

### S5 — Waiting keeps the cache warm
- **Status**: pending
- **Files**: `docs/delendai/host-appendices/claude-code.md`
- **Gate**: none
- acceptance:
  - "An agent that waits on long work is told, from its host profile, when to take a turn so its cache does not expire, and the guidance reaches every project through the skill and the host text init writes."

### S6 — Parallel work has a budget
- **Status**: pending
- **Files**: `packages/core/src/lib/shared/compute-slot.service.ts`
- **Gate**: none
- acceptance:
  - "How many agents work at once is bounded by the machine slot and the quota left; work beyond it queues and says so, and time spent queued is reported, so parallelism never costs more than it saves."

### S7 — Our own answers are small
- **Status**: pending
- **Files**: `packages/cli/src/commands/work.command.ts`
- **Gate**: none
- acceptance:
  - "work enter, prove, deliver and publish answer agents in a few lines by default (the PR, the failing lines), with the full record behind a flag; measured before and after."

## acceptance

- Every host in the catalogue states how it runs subagents (and whether one starts with its own context), whether a skill can run apart, how long its prompt cache lives, how it compacts, and where its usage can be read; what is not known is stated as unknown, never guessed.
- usage host-sessions reads each host whose usage source S1 names (Claude Code today, then Codex, OpenCode and the others that keep one) and says plainly for a host that keeps none.
- Asked about a task, delendai answers from the measured thread size, the host profile and the task size whether to do it in the thread or in a subagent, and on which model by the quota Batuta sees; a spec covers both answers.
- An orchestrator names a proposal and slice and the subagent receives the task briefing from work enter: the files, the acceptance and the one-line flow; a brief needs no pasted context.
- An agent that waits on long work is told, from its host profile, when to take a turn so its cache does not expire, and the guidance reaches every project through the skill and the host text init writes.
- How many agents work at once is bounded by the machine slot and the quota left; work beyond it queues and says so, and time spent queued is reported, so parallelism never costs more than it saves.
- work enter, prove, deliver and publish answer agents in a few lines by default (the PR, the failing lines), with the full record behind a flag; measured before and after.
