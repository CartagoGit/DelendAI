---
id: f00645
title: "List tools answer compact by default"
kind: feat
status: in-progress
type: proposal
track: trust
date: 2026-09-27
priority: P1
related: [x00673, f00536]
last-transition-id: 6c8ffa0b-2c18-4837-b9e8-b13d4ac0f3f2
last-correlation-id: 6c8ffa0b-2c18-4837-b9e8-b13d4ac0f3f2
last-transition-from: ready
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
one-off. Today the rule cannot even be applied by priority. Every
invocation record already carries its result's size (`responseBytes`),
but the usage report only summarises it per plugin as percentiles, so
which tools cost the most context is not known.

## why this design

- **Measure first.** The usage report ranks tools by the total and by
  the largest result they returned, from the `responseBytes` the
  invocation log already records. The host's call path does not change.
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

- **Status**: review
- **Files**:
  - `plugins/usage-tracking/src/lib/result-size-ranking.helper.ts`
  - `plugins/usage-tracking/src/lib/contracts/constants/result-size-rank-limit.constant.ts`
  - `plugins/usage-tracking/src/lib/contracts/result-size-ranking.interface.ts`
  - `plugins/usage-tracking/src/lib/tools/report.tool.ts`
  - `plugins/usage-tracking/tests/src/lib/result-size-ranking.spec.ts`
  - `plugins/usage-tracking/package.json`
  - `bun.lock`
- **Gate**: type
- acceptance:
  - "Every tool call's log entry carries the serialized size of its result." (already true: `responseBytes` in the invocation record)
  - "The usage report ranks tools by largest and by total result size."

### S2 — A routed call is measured under the tool it reached

- **Status**: review
- **DependsOn**: [S1]
- **Files**:
  - `plugins/usage-tracking/src/lib/routed-tool.helper.ts`
  - `plugins/usage-tracking/src/lib/record.ts`
  - `plugins/usage-tracking/tests/src/lib/routed-tool.helper.spec.ts`
- **Gate**: `npx vitest run plugins/usage-tracking/tests/src/lib/routed-tool.helper.spec.ts`
- acceptance:
  - "A call through `resolve_capability` that reached a tool is recorded under that tool; a refused route stays the router's."

Measured on 2026-09-29 from `invocations.jsonl`: `resolve_capability` led the
ranking with 23 MB over 848 calls (one of 620 KB), ahead of `review_queue`'s
11.7 MB. The router invokes the tool it resolves and returns that tool's
whole result, and the inner call leaves no record of its own, so every
routed result was booked to the router, and S3 would have compacted the
wrong tools. The record now takes the `qualifiedName` the router answers
with.

### S5 — A routed call is recorded once

- **Status**: review
- **DependsOn**: [S2]
- **Files**:
  - `packages/core/src/lib/project/tool-call-scope.helper.ts`
  - `packages/core/src/lib/project/instrument-tool-handlers.helper.ts`
  - `packages/core/tests/src/lib/project/instrument-tool-handlers.helper.spec.ts`
- **Gate**: `npx vitest run packages/core/tests/src/lib/project/instrument-tool-handlers.helper.spec.ts`
- acceptance:
  - "A tool call made from inside another tool call fires no `onToolStart`, `onToolCall` or `onToolCancel`; the outer call fires each once, and a later direct call of the inner tool is observed."

S2's premise was wrong. The router invokes the tool through the same
instrumented handler, so the inner call is recorded too: 329 of the 371
routed calls over 5 KB in `invocations.jsonl` have an inner record in the
same millisecond. Before S2 the log booked each routed call twice (the
router, then the tool); after S2 both records carry the tool's name, and
the router's copy weighs about twice the tool's (22:44:02 on 2026-09-28:
57,830 B inner, 119,717 B routed). S3's ranking would have counted every
routed tool three times over. Only the outermost call is the agent's, and
its answer is what reaches the agent's context, so observers now see that
one call, under the tool it reached.

### S3 — The largest list tools answer compact by default

- **Status**: review
- **DependsOn**: [S5]
- **Files**:
  - `plugins/proposals/src/lib/tools/proposal-board.tool.ts`
  - `plugins/proposals/src/lib/tools/authoring.tool.ts`
  - `plugins/proposals/src/lib/tools/agent-names.tool.ts`
  - `plugins/proposals/src/lib/shared/agent-names-list.ts`
  - `plugins/proposals/src/lib/contracts/interfaces/agent-assignment-brief.interface.ts`
  - `plugins/proposals/src/index.ts`
  - `plugins/proposals/src/public/index.ts`
  - `plugins/proposals/src/generated/tool-outputs.ts`
  - `plugins/proposals/tests/src/lib/authoring.spec.ts`
  - `plugins/proposals/tests/src/lib/shared/agent-names-list.spec.ts`
  - `plugins/proposals/tests/src/lib/tools/agent-names.tool.spec.ts`
- **Gate**: `npx vitest run plugins/proposals/tests/src/lib/authoring.spec.ts plugins/proposals/tests/src/lib/shared/agent-names-list.spec.ts plugins/proposals/tests/src/lib/tools/agent-names.tool.spec.ts`
- acceptance:
  - "Each of the five largest list tools by measured total returns compact entries by default, the full item for its id, and the whole page with `detail: true`."

Measured on 2026-09-29 from `invocations.jsonl`, without the router's copies
of routed calls (S5). The largest list tools by total were `review_queue`
(12.4 MB over 512 calls), `tool_search` (0.38 MB), `proposal_board`
(0.12 MB, 15 KB a call), `agent_names` (0.12 MB, 8.7 KB a `list`) and
`agent_catalog` (0.05 MB). `compact_router` and `vertex` rank above some of
them, but they are routers, not lists.

- `review_queue` (x00673), `agent_catalog` (`mode: "compact"`) and
  `tool_search` (entries with a `detailsId`) already had the shape.
- `proposal_board` now lists each proposal with its status, slice count and
  claimable slices; `proposalId` returns one proposal's slices, and
  `detail: true` all of them. It moved out of `authoring.tool.ts` into its
  own module.
- `agent_names { action: "list" }` now returns the counts and the active
  agents in brief; `who_uses` is the one agent, and `detail: true` the
  registry as stored.

### S4 — A lint keeps new list tools compact

- **Status**: in-progress
- **DependsOn**: [S3]
- **Files**:
  - `tools/scripts/lint/compact-list-tools.script.ts`
  - `tools/scripts/lint/compact-list-tools.script.spec.ts`
  - `tools/scripts/lint/compact-list-tools.baseline.json`
  - `tools/scripts/types/generate-tool-types.script.ts`
  - `tools/scripts/types/emit-tool-types.script.ts`
  - `tools/scripts/types/emit-tool-types.script.d.ts`
  - `package.json`
  - `.github/workflows/ci.yml`
- **Gate**: `npx vitest run tools/scripts/lint/compact-list-tools.script.spec.ts`
- acceptance:
  - "A tool whose output is an array of objects with more than five fields, and whose input takes neither an item id nor `detail`, is a finding."

`lint:compact-list-tools` reads every registered tool's output and input
schema from the server `types:generate` assembles (the harvest now keeps
the input too). An entry that carries its own `detailsId` counts as
compact. On 2026-09-29 it measured 205 tools; the 28 that already list full
items by default are baselined by name, and a new one fails. It runs in the
`lint-presets` CI job and in `validate:run`.

## dependency graph

S1 → S2 → S5 → S3 → S4.

## acceptance

- Tool result sizes are measured per tool, once per agent call.
- The five largest list tools answer compact by default.
- A new list tool that returns full items by default is flagged.
