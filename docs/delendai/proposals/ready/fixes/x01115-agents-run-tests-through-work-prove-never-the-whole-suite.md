---
id: x01115
title: "Agents run tests through work prove, never the whole suite"
kind: fix
status: ready
type: proposal
track: trust
date: 2026-11-21
---

# x01115 — Agents run tests through work prove, never the whole suite

## goal

An agent cannot start an unfiltered vitest run by hand: the root config refuses it with one line pointing to `delendai work prove`, agent runs lower their own priority, the rules say so in one place, and the guard reaches every project that init wires.

## why

Measured 2026-11-21: external reviewer agents (mimo-v2.6-flash, gpt-5.6) ran an unfiltered `node_modules/.bin/vitest run` at nice 0 for 13+ minutes in unit worktrees; host load reached 52 and other agents' delivers failed on lock and timing specs. AGENT-BOOTSTRAP.md says nothing about how agents run tests, so every new agent can repeat it. Target version @delendai/core 0.1.0.

## non-goals

- Blocking humans or CI
- Changing what work prove selects
- A new test runner

## slices

- global_gate: none

### S1 — The root vitest config refuses an unfiltered agent run and lowers its priority
- **Status**: pending
- **Files**: `vitest.config.ts`, `new:tools/scripts/lib/agent-full-suite-guard.ts`, `new:tools/scripts/lib/agent-full-suite-guard.spec.ts`, `tools/scripts/ci/prove-plan.script.ts`
- **Gate**: none
- **Decisions**: none
- acceptance:
  - "agent-full-suite-guard.spec.ts expects an unfiltered argv with DELENDAI_AGENT_ID, AI_AGENT or CLAUDECODE set and CI unset to be refused with one line naming `delendai work prove` [<50ms]"
  - "agent-full-suite-guard.spec.ts expects a run with a file or pattern filter, a --project or --changed flag, DELENDAI_FULL_SUITE=1, CI set, no agent identity, or a vitest worker (VITEST_WORKER_ID) to be allowed [<50ms]"
  - "agent-full-suite-guard.spec.ts expects the env prove-plan gives its vitest steps to carry DELENDAI_FULL_SUITE so a sanctioned job is allowed [<50ms]"

### S2 — The bootstrap and the work-unit playbook carry one rule: tests run through work prove
- **Status**: pending
- **Files**: `docs/delendai/AGENT-BOOTSTRAP.md`, `plugins/proposals/skills/delendai-work-unit-playbook/SKILL.md`
- **Gate**: none
- **Decisions**: none
- acceptance:
  - "AGENT-BOOTSTRAP.md states in one rule that tests run through `delendai work prove` and never the whole suite, and stays at or under 32,000 bytes (bootstrap-prompt-size spec)"
  - "delendai-work-unit-playbook SKILL.md repeats the rule for reviewers and implementers"

### S3 — The guard reaches every project init wires, with a migration for existing ones
- **Status**: pending
- **Files**: `packages/cli/src/lib/init`
- **Gate**: none
- **Decisions**: none
- acceptance:
  - "init writes or merges the guard for detected vitest or jest configs and a migration carries existing projects"

## acceptance

- agent-full-suite-guard.spec.ts expects an unfiltered argv with DELENDAI_AGENT_ID, AI_AGENT or CLAUDECODE set and CI unset to be refused with one line naming `delendai work prove` [<50ms]
- agent-full-suite-guard.spec.ts expects a run with a file or pattern filter, a --project or --changed flag, DELENDAI_FULL_SUITE=1, CI set, no agent identity, or a vitest worker (VITEST_WORKER_ID) to be allowed [<50ms]
- agent-full-suite-guard.spec.ts expects the env prove-plan gives its vitest steps to carry DELENDAI_FULL_SUITE so a sanctioned job is allowed [<50ms]
- AGENT-BOOTSTRAP.md states in one rule that tests run through `delendai work prove` and never the whole suite, and stays at or under 32,000 bytes (bootstrap-prompt-size spec)
- delendai-work-unit-playbook SKILL.md repeats the rule for reviewers and implementers
- init writes or merges the guard for detected vitest or jest configs and a migration carries existing projects
