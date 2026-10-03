---
id: f00645
title: "List tools answer compact by default"
kind: feat
status: done
type: proposal
track: trust
date: 2026-09-27
priority: P1
related: [x00673, f00536]
last-transition-id: 3e2b4348-ef3d-4b23-84f3-ffbccdf01983
last-correlation-id: 3e2b4348-ef3d-4b23-84f3-ffbccdf01983
last-transition-from: review
shipped-in:
  - "22ab06b48c4b512d1958595b368e7e2051feda36"
  - "ccb2e01b0d4c9c306db26f532588de94595884dd"
  - "24b2315c2dad5e4491b482e8d67b2cff07b444cf"
  - "8e014cff34b8e6e0a01a0443efd9ef423f9ea147"
  - "80a53ea9b0ec8d69e573d54576a564a97f4154c1"
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

- **Status**: done
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
- shipped-in: `c9099b1057fa`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-3
- review-log: approved by minimax-3 — f00645 S1 - tool results are measured. Real feat commit is 22ab06b48c4b512d1958595b368e7e2051feda36 (the merge c9099b1057fa brought it into develop). Adds plugins/usage-tracking/src/lib/result-size-ranking.helper.ts (rankToolResultSizes), its constant + interface, and the report.tool.ts uses it. Each invocation row already has responseBytes (no new measurement cost); the new code ranks by total and by largest result size. The targeted result-size-ranking.spec.ts asserts both 'ranks tools by total and by largest result, skipping unmeasured calls' + 'lists at most limit tools' + 'returns the rankings, and drops them from a compact report' = 3/3 passed. acceptance: responseBytes per record (pre-existing) + report ranks by largest + by total (new code).
- review-attribution: claude-opus-5-5 from Merge pull request #521 from CartagoGit/delendai/pr/claude-opus-5-5/implement/f00645-all-g1/tool-results-are-measured (refs/heads/delendai/wip/claude-opus-5-5/implement/f00645-all-g1/tool-results-are-measured) (22ab06b48c4b512d1958595b368e7e2051feda36), opened by minimax-3

### S2 — A routed call is measured under the tool it reached

- **Status**: done
- **DependsOn**: [S1]
- **Files**:
  - `plugins/usage-tracking/src/lib/routed-tool.helper.ts`
  - `plugins/usage-tracking/src/lib/record.ts`
  - `plugins/usage-tracking/tests/src/lib/routed-tool.helper.spec.ts`
- **Gate**: `npx vitest run plugins/usage-tracking/tests/src/lib/routed-tool.helper.spec.ts`
- acceptance:
  - "A call through `resolve_capability` that reached a tool is recorded under that tool; a refused route stays the router's."
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-3
- review-log: approved by minimax-3 — f00645 S2 - routed call attributed to the tool it reached. Real feat commit is ccb2e01b0d4c9c306db26f532588de94595884dd (the merge a03d2fdccade brought it into develop). Adds plugins/usage-tracking/src/lib/routed-tool.helper.ts (toolReachedBy helper) and small changes to plugins/usage-tracking/src/lib/record.ts (buildRecord now takes the qualifiedName the router answers with). Refused routes stay as the router's. gate: npx vitest run plugins/usage-tracking/tests/src/lib/routed-tool.helper.spec.ts => 3/3 passed, exit 0. Tests cover: 'names the tool the router reached' + 'keeps a refused route, and every other tool, as it was called' + 'is booked to the tool it reached, in the plugin that owns it'. acceptance: routed call recorded under the tool it reached, refused route stays the router's.
- review-attribution: claude-opus-5-5 from Merge pull request #625 from CartagoGit/delendai/pr/claude-opus-5-5/implement/f00645-S2-g1/routed-calls-are-measured-where-they-land (refs/heads/delendai/wip/claude-opus-5-5/implement/f00645-S2-g1/routed-calls-are-measured-where-they-land) (ccb2e01b0d4c9c306db26f532588de94595884dd), opened by minimax-3

Measured on 2026-09-29 from `invocations.jsonl`: `resolve_capability` led the
ranking with 23 MB over 848 calls (one of 620 KB), ahead of `review_queue`'s
11.7 MB. The router invokes the tool it resolves and returns that tool's
whole result, and the inner call leaves no record of its own, so every
routed result was booked to the router, and S3 would have compacted the
wrong tools. The record now takes the `qualifiedName` the router answers
with.
- shipped-in: `a03d2fdccade`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-3
- review-log: approved by minimax-3 — f00645 S2 - routed call attributed to the tool it reached. Real feat commit is ccb2e01b0d4c9c306db26f532588de94595884dd (the merge a03d2fdccade brought it into develop). Adds plugins/usage-tracking/src/lib/routed-tool.helper.ts (toolReachedBy helper) and small changes to plugins/usage-tracking/src/lib/record.ts (buildRecord now takes the qualifiedName the router answers with). Refused routes stay as the router's. gate: npx vitest run plugins/usage-tracking/tests/src/lib/routed-tool.helper.spec.ts => 3/3 passed, exit 0. Tests cover: 'names the tool the router reached' + 'keeps a refused route, and every other tool, as it was called' + 'is booked to the tool it reached, in the plugin that owns it'. acceptance: routed call recorded under the tool it reached, refused route stays the router's.
- review-attribution: claude-opus-5-5 from Merge pull request #625 from CartagoGit/delendai/pr/claude-opus-5-5/implement/f00645-S2-g1/routed-calls-are-measured-where-they-land (refs/heads/delendai/wip/claude-opus-5-5/implement/f00645-S2-g1/routed-calls-are-measured-where-they-land) (ccb2e01b0d4c9c306db26f532588de94595884dd), opened by minimax-3

### S5 — A routed call is recorded once

- **Status**: done
- **DependsOn**: [S2]
- **Files**:
  - `packages/core/src/lib/project/tool-call-scope.helper.ts`
  - `packages/core/src/lib/project/instrument-tool-handlers.helper.ts`
  - `packages/core/tests/src/lib/project/instrument-tool-handlers.helper.spec.ts`
- **Gate**: `npx vitest run packages/core/tests/src/lib/project/instrument-tool-handlers.helper.spec.ts`
- acceptance:
  - "A tool call made from inside another tool call fires no `onToolStart`, `onToolCall` or `onToolCancel`; the outer call fires each once, and a later direct call of the inner tool is observed."
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-3
- review-log: approved by minimax-3 — f00645 S5 - inner tool calls fired by another tool are not observed again. Real feat commit is 24b2315c2dad5e4491b482e8d67b2cff07b444cf (the merge 0caa6f8d3273 brought it into develop). Introduces packages/core/src/lib/project/tool-call-scope.helper.ts and rewires packages/core/src/lib/project/instrument-tool-handlers.helper.ts so handlers fire onToolStart/onToolCall/onToolCancel once for the outermost call. tool-call-scope is a depth-counter that suppresses nested hook invocations. gate: npx vitest run packages/core/tests/src/lib/project/instrument-tool-handlers.helper.spec.ts => 4/4 passed, exit 0. Acceptance test 'a tool call made by another tool > is observed once, as the call the agent made' is explicit. acceptance: inner tool calls fire no lifecycle hooks; outer fires each once; later direct call observed.
- review-attribution: claude-opus-5-5 from Merge pull request #633 from CartagoGit/delendai/pr/claude-opus-5-5/implement/f00645-S5-g1/a-routed-call-is-recorded-once (refs/heads/delendai/wip/claude-opus-5-5/implement/f00645-S5-g1/a-routed-call-is-recorded-once) (24b2315c2dad5e4491b482e8d67b2cff07b444cf), opened by minimax-3

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
- shipped-in: `0caa6f8d3273`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-3
- review-log: approved by minimax-3 — f00645 S5 - inner tool calls fired by another tool are not observed again. Real feat commit is 24b2315c2dad5e4491b482e8d67b2cff07b444cf (the merge 0caa6f8d3273 brought it into develop). Introduces packages/core/src/lib/project/tool-call-scope.helper.ts and rewires packages/core/src/lib/project/instrument-tool-handlers.helper.ts so handlers fire onToolStart/onToolCall/onToolCancel once for the outermost call. tool-call-scope is a depth-counter that suppresses nested hook invocations. gate: npx vitest run packages/core/tests/src/lib/project/instrument-tool-handlers.helper.spec.ts => 4/4 passed, exit 0. Acceptance test 'a tool call made by another tool > is observed once, as the call the agent made' is explicit. acceptance: inner tool calls fire no lifecycle hooks; outer fires each once; later direct call observed.
- review-attribution: claude-opus-5-5 from Merge pull request #633 from CartagoGit/delendai/pr/claude-opus-5-5/implement/f00645-S5-g1/a-routed-call-is-recorded-once (refs/heads/delendai/wip/claude-opus-5-5/implement/f00645-S5-g1/a-routed-call-is-recorded-once) (24b2315c2dad5e4491b482e8d67b2cff07b444cf), opened by minimax-3

### S3 — The largest list tools answer compact by default

- **Status**: done
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
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-3
- review-log: approved by minimax-3 — f00645 S3 - the largest list tools answer compact by default. Real feat commit is 8e014cff34b8e6e0a01a0443efd9ef423f9ea147 (the merge 1de0ade67cf8 brought it into develop). proposal_board.tool.ts now defaults to compact entries (status + slice count) and adds proposalId (one proposal's slices with status+owner) + detail: true (whole page). authoring.tool.ts (plan index) + agent-names.tool.ts + shared/agent-names-list.ts follow the same shape. docs/delendai/TOKEN-BUDGETS.md updated. gate: npx vitest run plugins/proposals/tests/src/lib/{authoring.spec.ts,shared/agent-names-list.spec.ts,tools/agent-names.tool.spec.ts} => 3 files / 26 tests passed, exit 0. Acceptance tests include 'lists the active agents in brief, with the counts' + 'returns the registry as stored with detail' which cover the compact + detail shape. acceptance: each of the five largest list tools returns compact by default, full item for id, full page with detail:true.
- review-attribution: claude-opus-5-5 from Merge pull request #643 from CartagoGit/delendai/pr/claude-opus-5-5/implement/f00645-S3-g1/list-tools-answer-compact (refs/heads/delendai/wip/claude-opus-5-5/implement/f00645-S3-g1/list-tools-answer-compact) (8e014cff34b8e6e0a01a0443efd9ef423f9ea147), opened by minimax-3

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
- shipped-in: `1de0ade67cf8`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-3
- review-log: approved by minimax-3 — f00645 S3 - the largest list tools answer compact by default. Real feat commit is 8e014cff34b8e6e0a01a0443efd9ef423f9ea147 (the merge 1de0ade67cf8 brought it into develop). proposal_board.tool.ts now defaults to compact entries (status + slice count) and adds proposalId (one proposal's slices with status+owner) + detail: true (whole page). authoring.tool.ts (plan index) + agent-names.tool.ts + shared/agent-names-list.ts follow the same shape. docs/delendai/TOKEN-BUDGETS.md updated. gate: npx vitest run plugins/proposals/tests/src/lib/{authoring.spec.ts,shared/agent-names-list.spec.ts,tools/agent-names.tool.spec.ts} => 3 files / 26 tests passed, exit 0. Acceptance tests include 'lists the active agents in brief, with the counts' + 'returns the registry as stored with detail' which cover the compact + detail shape. acceptance: each of the five largest list tools returns compact by default, full item for id, full page with detail:true.
- review-attribution: claude-opus-5-5 from Merge pull request #643 from CartagoGit/delendai/pr/claude-opus-5-5/implement/f00645-S3-g1/list-tools-answer-compact (refs/heads/delendai/wip/claude-opus-5-5/implement/f00645-S3-g1/list-tools-answer-compact) (8e014cff34b8e6e0a01a0443efd9ef423f9ea147), opened by minimax-3

### S4 — A lint keeps new list tools compact

- **Status**: done
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
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-3
- review-log: approved by minimax-3 — f00645 S4 - the lint keeps new list tools compact. Real feat commit is 80a53ea9b0ec8d69e573d54576a564a97f4154c1 (the merge ec98c0d31348 brought it into develop). Adds tools/scripts/lint/compact-list-tools.script.ts (compactListFindings + newFindings), spec, and the baseline. CI workflow wired into .github/workflows/ci.yml. gate: vitest run tools/scripts/lint/compact-list-tools.script.spec.ts => 4/4 passed, exit 0. Acceptance test 'finds a list of full items, however deep, in a tool without a detail input' + 'accepts entries of five fields, entries with a detailsId, and tools that take an id or detail' + 'reads the variants of a union output' + 'keeps only the tools the baseline does not name'. Live lint: bun tools/scripts/lint/compact-list-tools.script.ts => ✓ 205 tools, no new list of full items (28 baselined), exit 0. acceptance: a tool whose output is an array of objects with more than five fields, and whose input takes neither an item id nor detail, is a finding.
- review-attribution: claude-opus-5-5 from Merge pull request #644 from CartagoGit/delendai/pr/claude-opus-5-5/implement/f00645-S4-g1/a-lint-keeps-list-tools-compact (refs/heads/delendai/wip/claude-opus-5-5/implement/f00645-S4-g1/a-lint-keeps-list-tools-compact) (80a53ea9b0ec8d69e573d54576a564a97f4154c1), opened by minimax-3

`lint:compact-list-tools` reads every registered tool's output and input
schema from the server `types:generate` assembles (the harvest now keeps
the input too). An entry that carries its own `detailsId` counts as
compact. On 2026-09-29 it measured 205 tools; the 28 that already list full
items by default are baselined by name, and a new one fails. It runs in the
`lint-presets` CI job and in `validate:run`.
- shipped-in: `ec98c0d31348`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-3
- review-log: approved by minimax-3 — f00645 S4 - the lint keeps new list tools compact. Real feat commit is 80a53ea9b0ec8d69e573d54576a564a97f4154c1 (the merge ec98c0d31348 brought it into develop). Adds tools/scripts/lint/compact-list-tools.script.ts (compactListFindings + newFindings), spec, and the baseline. CI workflow wired into .github/workflows/ci.yml. gate: vitest run tools/scripts/lint/compact-list-tools.script.spec.ts => 4/4 passed, exit 0. Acceptance test 'finds a list of full items, however deep, in a tool without a detail input' + 'accepts entries of five fields, entries with a detailsId, and tools that take an id or detail' + 'reads the variants of a union output' + 'keeps only the tools the baseline does not name'. Live lint: bun tools/scripts/lint/compact-list-tools.script.ts => ✓ 205 tools, no new list of full items (28 baselined), exit 0. acceptance: a tool whose output is an array of objects with more than five fields, and whose input takes neither an item id nor detail, is a finding.
- review-attribution: claude-opus-5-5 from Merge pull request #644 from CartagoGit/delendai/pr/claude-opus-5-5/implement/f00645-S4-g1/a-lint-keeps-list-tools-compact (refs/heads/delendai/wip/claude-opus-5-5/implement/f00645-S4-g1/a-lint-keeps-list-tools-compact) (80a53ea9b0ec8d69e573d54576a564a97f4154c1), opened by minimax-3

## dependency graph

S1 → S2 → S5 → S3 → S4.

## acceptance

- Tool result sizes are measured per tool, once per agent call.
- The five largest list tools answer compact by default.
- A new list tool that returns full items by default is flagged.
