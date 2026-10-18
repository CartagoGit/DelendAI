---
id: x00914
title: "Token budgets measure what reaches the model"
kind: fix
status: review
type: proposal
track: general
date: 2026-10-18
last-transition-id: f4be19bf-dfc4-44fe-ba66-3c1fc3b2b779
last-correlation-id: f4be19bf-dfc4-44fe-ba66-3c1fc3b2b779
last-transition-from: in-progress
last-transition-at: 2026-10-18T10:23:27.678Z
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

- **Status**: review
- **Files**:
  - `tools/scripts/report/token-budget-report-lib.ts`
  - `docs/delendai/TOKEN-BUDGETS.md`
- **Gate**: type
- acceptance:
  - "A tool's measured bytes are its structured content's when it returns one, its text otherwise (`payloadBytes`), for every row of the dashboard and the gate; the dashboard is regenerated and every row stays within its hard budget, or the payload that breaches is shrunk in this slice. Regenerated 2026-10-18: overview full 55 → 2,105 B (managed) and 56 → 14,485 B (native), overview compact 63 → 875 / 64 → 2,419 B, agent_catalog 32 → 745 / 33 → 10,212 B, logs_tail 28 → 63 B; every row within its hard budget. `agent_catalog full` is over its warning (10,212 > 9,800 B), now measured for the first time."
- review-state: in_review
- review-implementer: claude-opus-5-5
- shipped-in: `b6003e1c5e8c`

### S2 — The cold start points past itself

- **Status**: review
- **Files**:
  - `plugins/proposals/src/lib/skills/proposals-workflow-contribution.ts`
  - `plugins/proposals/tests/src/lib/skills/proposals-workflow-contribution.spec.ts`
  - `packages/core/tests/src/lib/cli/assemble-skills.spec.ts`
- **Gate**: type
- acceptance:
  - "The proposals workflow contribution recommends `<prefix>_proposals_auto_work` without naming the cold-start call that delivers it."
- review-state: in_review
- review-implementer: claude-opus-5-5
- shipped-in: `b6003e1c5e8c`

### S3 — A work plan names only the plugins the server has

- **Status**: review
- **Files**:
  - `plugins/proposals/src/lib/tools/auto-work.tool.ts`
  - `plugins/proposals/src/index.ts`
  - `plugins/proposals/tests/src/lib/auto-work.spec.ts`
- **Gate**: type
- acceptance:
  - "Found while measuring S1: every `auto_work` work plan carried 'if the logs plugin is loaded' and 'if the notification plugin is loaded' steps, and a claim step naming `notification_await_lock`, whatever the server loaded (the token fixture loads neither). The plan now reads the peer registry at call time: a step about an absent plugin is left out, a present plugin's step drops its 'if loaded' clause, and a host that gives no registry keeps every step as before. A spec holds the three cases."
- review-state: in_review
- review-implementer: claude-opus-5-5
- shipped-in: `a7c146bfbd91`

## acceptance

- No token budget is measured on a string the model does not receive.
- The cold-start answer's next action is one the agent has not taken.
