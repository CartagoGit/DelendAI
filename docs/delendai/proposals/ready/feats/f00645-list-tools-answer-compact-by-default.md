---
id: f00645
title: "List tools answer compact by default"
kind: feat
status: ready
type: proposal
track: trust
date: 2026-09-27
priority: P1
related: [x00673, f00536]
---

# f00645 — List tools answer compact by default

## goal

Every tool that lists a collection returns, by default, what an agent
needs to choose: one small entry per item. The evidence for an item comes
back only for the item asked for. The tools that return the most are
known from measurement, not guessed.

## why

x00673 made `review_queue` a compact list. One call with `limit: 40` had
been 624 KB, most of it evidence for proposals the reviewer was not going
to review. An external review (2026-09-27) called this pattern
(list → select → detail) one of the strongest token levers in the
project, and asked for it to become a rule across tools rather than a
one-off. Today the rule cannot even be applied by priority. The server's
logs record every call, but not how big its answer was, so which tools
cost the most context is not known.

## why this design

- **Measure first.** The host records each tool result's serialized
  size (bytes of `structuredContent`, else of the text) in the call log
  it already writes, and the usage report ranks tools by size and by
  total.
- **One shape for list tools.** A list tool's input takes an item id
  (the detail of that item) and `detail: true` (the whole page in full).
  Without either, it returns entries of the item's identity, state and
  next action. `review_queue` is the reference.
- **Enforce it where it is cheap to check.** A lint flags a tool whose
  output schema returns an array of objects with more than a few fields
  and whose input takes neither an item id nor `detail`.

## non-goals

- Changing a tool's detail payload. The detail stays as it is; only the
  default changes.

## Slices

- global_gate: none

### S1 — Tool results are measured

- **Status**: pending
- **Files**: `packages/core/src/lib/project/instrument-tool-handlers.helper.ts`
- **Gate**: type
- acceptance:
  - "Every tool call's log entry carries the serialized size of its result."
  - "The usage report ranks tools by largest and by total result size."

### S2 — The largest list tools answer compact by default

- **Status**: pending
- **DependsOn**: [S1]
- **Files**: `plugins/proposals/src/lib/services/review-queue-view.service.ts`
- **Gate**: type
- acceptance:
  - "Each of the five largest list tools by measured total returns compact entries by default, the full item for its id, and the whole page with `detail: true`."

### S3 — A lint keeps new list tools compact

- **Status**: pending
- **DependsOn**: [S2]
- **Files**: `tools/scripts/lint/compact-list-tools.script.ts`
- **Gate**: type
- acceptance:
  - "A tool whose output is an array of objects with more than five fields, and whose input takes neither an item id nor `detail`, is a finding."

## dependency graph

S1 → S2 → S3.

## acceptance

- Tool result sizes are measured per tool.
- The five largest list tools answer compact by default.
- A new list tool that returns full items by default is flagged.
