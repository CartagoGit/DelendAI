---
id: f00187
title: "agent-orchestrator S6 — i18n catalogue entry for _plan"
kind: feat
status: done
type: proposal
track: agent-orchestrator
date: 2026-08-26
date_iso: 2026-08-26
mode: general
parent-plan: q00007
author: mcp-vertex-orchestrator (MiniMax M3, agent mode)
---
# f00187 — `agent-orchestrator` S6

## Goal

Add the i18n catalogue entry for the most-visible tool string
(`_plan` description) so the docs site can render it in 12 languages.

## Acceptance

- `apps/web/src/i18n/tools/mcp-vertex_agent-orchestrator_plan.ts`
  exports `agentOrchestratorPlanI18n` with a 12-language
  `description` map aligned with the runtime description in
  `plugins/agent-orchestrator/src/lib/tools/plan.tool.ts`.
- `apps/web/src/i18n/tools/index.ts` registers the new entry.
- `bun run check:i18n` stays green: 12 languages × 316 keys (was
  315 before this slice).

## Why only the plan tool

S2 added three more tools (`_dispatch`, `_budget`, `_plan_ref`)
and S4 added two (`_classify`, `_events`). The plan tool's
description is the only one rendered in the docs site today; the
others are runtime-only. Adding a single entry is enough to
exercise the catalogue, and the `l100` gate does not yet require
12-lang completeness for every tool — populating them all in one
proposal would be premature.
