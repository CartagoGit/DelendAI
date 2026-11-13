---
id: v00151
title: "The compact router returns each result once"
kind: perf
status: done
type: proposal
track: tokens
date: 2026-10-31
last-transition-id: e67cdcad-785b-494f-936d-c6694e180641
last-correlation-id: e67cdcad-785b-494f-936d-c6694e180641
last-transition-from: review
last-transition-at: 2026-11-02T17:44:38.028Z
shipped-in:
  - "49ccba7da8683bc2ceeb534cff76e18f5d2f56eb"
---

# v00151 — The compact router returns each result once

## goal

An agent working through the compact router pays for each tool's answer once, with nothing lost.

## why

Most tools answer with the same JSON as text and as structured content, and the router forwarded both. Measured on the 574 routed results of one working session (2026-10-31): 444 KB of 1,029 KB, 43%, was the copy. Each call any agent makes through the router paid for it in tokens. The published task cost fell with the fix: a cold start from 168 to 97 estimated tokens, and p95 from 207 to 114.

## non-goals

- Changing what a tool answers or the router's output schema: both fields stay optional.
- Dropping a failed call's text: the VS Code extension reads the reason from it.

## slices

- global_gate: type

### S1 — The router drops the repeated text
- **Status**: done
- **Files**: `packages/core/src/lib/tools/compact-router.tool.ts`, `packages/core/tests/src/lib/e2e/compact-router-resolver.spec.ts`, `tools/scripts/report/token-budget-dashboard.spec.ts`
- **Gate**: type
- acceptance:
  - "A routed result whose text restates its structured content, once parsed, carries only `structuredContent`. Text that says something else, and every failed call, keeps its `text`, which clients read the reason from (compact-router-resolver.spec.ts)."
- shipped-in: `6aa11ad8443c`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3.1-flash
- review-log: approved by minimax-m3.1-flash — verified at 49ccba7da868, validate exit 0 and tests 7/7 claimed, no recorded run cited; acceptance 1/1: (1) At 49ccba7da8683bc2ceeb534cff76e18f5d2f56eb packages/core/src/lib/tools/compact-router.tool.ts exports textRepeatsStructured, which parses the text, compares i… — Approved on the delivered state of 49ccba7da8683bc2ceeb534cff76e18f5d2f56eb (PR #1593). The compact router now answers each result once: the delivered helper parses the text and compares it with the structured content, so a routed success whose text only restates that content carries the structured content alone, while a text that says something else, a call with no structured content and every failed call keep their text, which is where a client reads the reason from. The merge touches the router, its e2e spec, the token budget dashboard spec, the budget document and the proposal itself, and changes nothing else. The type gate exited 0 in the review unit.

## acceptance

- A routed result whose text restates its structured content, once parsed, carries only `structuredContent`. Text that says something else, and every failed call, keeps its `text`, which clients read the reason from (compact-router-resolver.spec.ts).
