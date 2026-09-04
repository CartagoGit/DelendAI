---
name: incident-response
id: incident-response
title: Incident response
category: safety
tags: ['incident', 'operations', 'logs', 'recovery']
tools: ['mcp-vertex_observability_obs_errors', 'mcp-vertex_logs_query', 'mcp-vertex_logs_tail', 'mcp-vertex_notification_await_lock', 'mcp-vertex_proposals_state_repair', 'mcp-vertex_proposals_agents_lock_diagnose']
appliesTo: ['@delendai/skills-pack', '@delendai/observability', '@delendai/logs', '@delendai/notification', '@delendai/proposals']
description: Respond to a runtime incident by gathering remote error evidence, correlating local logs, waiting on active owners, and repairing broken proposal state only when necessary.
---

# Incident response

## Goal

Restore service or workflow stability while preserving enough evidence to
understand what failed and why.

## When to use

Use this when a production-like incident, broken automation, or repeated agent
failure requires coordinated diagnosis under time pressure.

## Steps

1. Start with `mcp-vertex_observability_obs_errors` to confirm the external
   symptom, affected issue titles, and recent recurrence window.
2. Pivot to `mcp-vertex_logs_query` for historical local evidence that matches
   the same timeframe or identifiers.
3. Use `mcp-vertex_logs_tail` when the incident is still active and you need the
   current stream rather than a retrospective slice.
4. If the suspected fix path touches files or state owned by another agent,
   wait with `mcp-vertex_notification_await_lock` rather than racing the owner.
5. Diagnose lock anomalies with `mcp-vertex_proposals_agents_lock_diagnose`
   before deciding whether the incident is operational or just coordination
   drift.
6. Use `mcp-vertex_proposals_state_repair` only when the evidence shows the
   proposals state itself is inconsistent and the repair is narrower than the
   incident.

## Checks

- The remote symptom and local log evidence point to the same timeframe.
- Any wait on a lock is intentional and bounded by an identified owner.
- Repair actions are justified by diagnosis, not by urgency alone.
- The incident notes separate confirmed facts from working hypotheses.

## Exit criteria

- Impact is contained or the incident is handed off with concrete evidence.
- The next operator can see what was observed, changed, and still unknown.
- No state repair or lock intervention happened without an audit trail.

## References

- `mcp-vertex_observability_obs_errors`
- `mcp-vertex_logs_query`
- `mcp-vertex_logs_tail`
- `mcp-vertex_notification_await_lock`
- `mcp-vertex_proposals_agents_lock_diagnose`
- `mcp-vertex_proposals_state_repair`