---
id: v00151
title: "The compact router returns each result once"
kind: perf
status: review
type: proposal
track: tokens
date: 2026-10-31
last-transition-id: 12430c3f-861a-4ad1-a5a2-690b12ffd737
last-correlation-id: 12430c3f-861a-4ad1-a5a2-690b12ffd737
last-transition-from: in-progress
last-transition-at: 2026-10-31T21:41:24.287Z
---

# v00151 — The compact router returns each result once

## goal

An agent working through the compact router pays for each tool's answer once, with nothing lost.

## why

Most tools answer with the same JSON as text and as structured content, and the router forwarded both. Measured on the 574 routed results of one working session (2026-10-31): 444 KB of 1,029 KB, 43%, was the copy. Each call any agent makes through the router paid for it in tokens.

## non-goals

- Changing what a tool answers or the router's output schema: both fields stay optional.
- Dropping a failed call's text: the VS Code extension reads the reason from it.

## slices

- global_gate: type

### S1 — The router drops the repeated text
- **Status**: review
- **Files**: `packages/core/src/lib/tools/compact-router.tool.ts`, `packages/core/tests/src/lib/e2e/compact-router-resolver.spec.ts`
- **Gate**: type
- acceptance:
  - "A routed result whose text restates its structured content, once parsed, carries only `structuredContent`. Text that says something else, and every failed call, keeps its `text`, which clients read the reason from (compact-router-resolver.spec.ts)."
- shipped-in: `6aa11ad8443c`
- review-state: in_review
- review-implementer: claude-opus-5-5

## acceptance

- A routed result whose text restates its structured content, once parsed, carries only `structuredContent`. Text that says something else, and every failed call, keeps its `text`, which clients read the reason from (compact-router-resolver.spec.ts).
