---
name: mcp-vertex-debugging-playbook
id: mcp-vertex-debugging-playbook
title: Debugging playbook
category: development
tags: ['debugging', 'playbook', 'diagnostic', 'logs', 'proposals', 'state-repair']
tools: ['mcp-vertex_logs_query', 'mcp-vertex_logs_tail', 'mcp-vertex_proposals_state_health', 'mcp-vertex_proposals_state_repair', 'mcp-vertex_proposals_proposal_diagnose', 'mcp-vertex_proposals_agents_lock_diagnose', 'mcp-vertex_proposals_agent_lock', 'mcp-vertex_proposals_agent_lock_release_orphan']
appliesTo: ['@mcp-vertex/skills-pack', '@mcp-vertex/logs', '@mcp-vertex/proposals', '@mcp-vertex/notification']
description: Triage failing agent runs, broken tests, or unexpected output by correlating logs, proposal state, and lock ownership before applying repair tools. Each step is a single decision that points at the existing gated tools instead of speculative debugging prints.
---

# Debugging playbook

When something is broken — a failing test, a slow build, a wrong result, an
infinite loop, a stuck swarm — work the loop below **in order**. Skipping
steps is what makes debugging slow and unreliable.

## Goal

Reach a root-cause fix and a regression guard, by working the existing
gated tools (logs, proposals, lock diagnostics) in a fixed order — never
guessing, never reformatting the suspect file "while I'm here", never
adding debug prints to the source.

## Steps

1. **Orient (30s)** — Read the proposal / slice acceptance. State the
   contract, the observed behaviour, the smallest reproducer. If you
   cannot state all three, gather the missing data first.
2. **Reproduce** — Make the failure happen on demand with the smallest
   possible input. One command, one file, one env var. If it is flaky,
   capture the distribution, not a single run.
3. **Instrument** — Use `mcp-vertex_logs_tail` / `mcp-vertex_logs_query`
   to read the relevant scope (system, plugin, tool). Do not add
   speculative prints to the source.
4. **Isolate** — `mcp-vertex_proposals_proposal_diagnose` to read the
   diff that introduced the failure. For tests, narrow to one test file
   before bisecting. For lock conflicts, `mcp-vertex_proposals_state_health`
   + `mcp-vertex_proposals_agents_lock_diagnose` to see the current
   owners.
5. **Fix (minimal, root-cause)** — Fix the root cause, not the symptom.
   A debugging PR is not the moment to reformat. Add the failing test
   first (TDD), then the fix.
6. **Verify** — The new test passes, the original reproducer is gone,
   the full validate gate is green. No neighbouring test, lint rule, or
   type check regressed.
7. **Prevent (close the loop)** — Ask: "what would have caught this
   earlier?" A new lint rule, a new invariant in the proposal
   `## acceptance`, a new test fixture, a new log line — only if the
   existing gated tool does not already cover it.

## Exit criteria

- New regression test is in place and passing.
- Original reproducer no longer reproduces.
- `bun run validate` is green on the affected preset(s).
- If a lock was involved, the orphan release / state-repair has been
  called (and the result is `ok: true`).

## When to stop

You are not done until all four exit criteria are green. "I'll fix the
tests in a follow-up" is a refusal of the contract.
