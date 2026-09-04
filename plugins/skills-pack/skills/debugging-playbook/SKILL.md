---
name: debugging-playbook
id: debugging-playbook
title: Debugging playbook
category: dev
tags: ['debugging', 'triage', 'logs', 'state']
tools: ['mcp-vertex_logs_query', 'mcp-vertex_logs_tail', 'mcp-vertex_proposals_state_health', 'mcp-vertex_proposals_state_repair', 'mcp-vertex_proposals_proposal_diagnose', 'mcp-vertex_proposals_agents_lock_diagnose', 'mcp-vertex_proposals_agent_lock', 'mcp-vertex_proposals_agent_lock_release_orphan']
appliesTo: ['@delendai/skills-pack', '@delendai/logs', '@delendai/proposals']
description: Triage a failing agent or unexpected output by checking the evidence trail first, then diagnosing proposal state and file-lock ownership before repairing anything.
---

# Debugging playbook

## Goal

Stabilize a failing run without guessing. Start from the cheapest evidence,
identify whether the fault is in logs, proposal state, or lock ownership, and
only then apply a repair action.

## When to use

Use this when an agent loop stalls, a tool returns unexpected output, or a
proposal workflow appears stuck after a crash or interrupted session.

## Steps

1. Query the recent timeline with `mcp-vertex_logs_query` using the narrowest
   time window and correlation key you have.
2. Follow with `mcp-vertex_logs_tail` when you need the live edge of the same
   execution stream instead of a historical slice.
3. If the symptom involves proposal progress, run
   `mcp-vertex_proposals_proposal_diagnose` on the proposal id that looks stuck.
4. When the failure smells like stale or contradictory state, inspect
   `mcp-vertex_proposals_state_health` before attempting repair.
5. If edits are blocked by claims, inspect ownership with
   `mcp-vertex_proposals_agents_lock_diagnose` and confirm whether the holder is
   active, stale, or orphaned.
6. Use `mcp-vertex_proposals_agent_lock` only for legitimate claim, release, or
   status operations on files you actually own.
7. Use `mcp-vertex_proposals_agent_lock_release_orphan` only after the
   diagnosis proves the lock holder is orphaned and no active agent can release
   it cleanly.
8. Call `mcp-vertex_proposals_state_repair` only after you can name the exact
   inconsistency it is supposed to fix.

## Checks

- You can point to one concrete failing run, proposal, or claim rather than a
  vague symptom.
- The logs timeline and the proposal diagnosis agree on where the failure is.
- Any orphan release is justified by a prior lock diagnosis, not by impatience.
- Any state repair is scoped to a confirmed inconsistency, not used as a reset.

## Exit criteria

- The root cause is isolated to one slice: logs, proposal state, or lock table.
- The minimal repair action has been applied, or the playbook produced enough
  evidence to escalate without guesswork.
- No lock was force-released and no state was rewritten without prior evidence.

## References

- `mcp-vertex_logs_query`
- `mcp-vertex_logs_tail`
- `mcp-vertex_proposals_state_health`
- `mcp-vertex_proposals_state_repair`
- `mcp-vertex_proposals_proposal_diagnose`
- `mcp-vertex_proposals_agents_lock_diagnose`
- `mcp-vertex_proposals_agent_lock`
- `mcp-vertex_proposals_agent_lock_release_orphan`
