---
id: x00914
title: "Token budgets measure what reaches the model"
kind: fix
status: ready
type: proposal
track: general
date: 2026-10-18
---

# x00914 — Token budgets measure what reaches the model

## goal

Every payload row of the token budgets (`tokens:gate`, `docs/delendai/TOKEN-BUDGETS.md`) counts the bytes a model receives from the tool: its structured content when it returns one, its text otherwise. When this is done no row records a one-line summary as the cost of a tool whose payload is two kilobytes, and the cold-start answer no longer tells the agent to call the tool it just called.

## why

Measured 2026-10-18 on `develop`:

- `measureToolText` (`tools/scripts/report/token-budget-report-lib.ts`) reads `content[0].text` only. Three tools answer through `toolJsonWithSummary` (`delendai_overview`, `delendai_agent_catalog`, the logs plugin's tools), whose text is a one-line summary and whose payload is in `structuredContent`. The dashboard records `overview full` at 55 bytes, `overview compact` at 63, `agent_catalog compact` at 32 and `logs_tail` at 28; the managed overview's structured content is 2,105 bytes and its compact form 875. A host such as Claude Code hands the model the structured content (this session's `delendai_overview` call returned the full JSON), so those rows measure a string no model reads and their budgets (11,000 B warning for 55 B) guard nothing.
- `delendai_overview`'s `recommendedNextAction` reads "Call delendai_overview, then delendai_proposals_auto_work to start working." The proposals plugin's workflow contribution names the cold-start call as the first step, and it is only ever read by an agent that has made it (overview, project context).

## non-goals

- Changing what the three tools answer: only what the budgets count.
- Raising any budget: a row that now breaches is a payload to shrink, not a ceiling to lift.

## slices

- global_gate: type

### S1 — Count the payload the model gets

- **Status**: pending
- **Files**: `tools/scripts/report/token-budget-report-lib.ts`
- **Gate**: type
- acceptance:
  - "A tool's measured bytes are its structured content's when it returns one, its text otherwise, for every row of the dashboard and the gate; the dashboard is regenerated and every row stays within its hard budget, or the payload that breaches is shrunk in this slice."

### S2 — The cold start points past itself

- **Status**: pending
- **Files**: `plugins/proposals/src/lib/skills/proposals-workflow-contribution.ts`
- **Gate**: type
- acceptance:
  - "The proposals workflow contribution recommends `<prefix>_proposals_auto_work` without naming the cold-start call that delivers it."

## acceptance

- No token budget is measured on a string the model does not receive.
- The cold-start answer's next action is one the agent has not taken.
