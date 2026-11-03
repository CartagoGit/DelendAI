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

Asked by the owner on 2026-11-03, after a day of measured orchestration: delendai should make any host and any model spend little on agents and subagents, in every project, not only here. Measured that day (Claude Code, `delendai usage host-sessions`):

- **The thread is the cost.** The main thread ran 1,111 calls at a median 557k tokens of context (max 966k): every call re-reads all of it. A Sonnet subagent did the same kind of task at about 65k, roughly nine times cheaper (d00417 S2: 46 calls, 2.9M cache reads against ~25M in the main thread).
- **The cache has a lifetime.** A prompt cache lives about an hour after the last request (each provider differs: Anthropic offers 5-minute and 1-hour tiers, OpenAI caches automatically for minutes, Gemini caches explicitly). A large thread that waits longer on its subagents rewrites its whole context at the cache-write price.
- **Briefs repeat what can be read.** Subagent prompts carried the bootstrap, the flow and the commands, which each subagent then read again on its own.
- **Parallel work fights itself.** Six subagents ran proofs at once on one machine: load 20 to 30, proofs of 30 to 60 minutes, timing-sensitive specs failing, a CLI call timing out, and retries paid in tokens. Running them one at a time fixed it (now x01006).
- **Our own answers are long.** `work deliver`, `prove` and `publish` print large JSON records that every agent reads into its context.
- **Leftover background work wakes the thread.** Subagents leave background waiters running after they report; each repeated notice gives the large thread a turn, at the price of a cached read of its whole context.

What exists already: a managed, lazy tool surface; compact tools; the bootstrap at 21.8 KB under a gate; host appendices per host; task briefings at entry (f00799 S1); skills that run apart on Claude Code (S4); the Claude Code meter (S5); the proof queue (x01006); checks scoped to the change (q00038). What is missing is the host's cost profile: the catalogue describes where each host keeps its agents, skills and instructions, and nothing about how it runs subagents, how long its cache lives, how it compacts or where its usage can be read, so delendai cannot advise on any host but Claude Code.

## non-goals

- Choosing a provider's prices for the user, or spending without consent: Batuta stays advisory unless the project allows it.
- Replacing a host's own compaction.

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
