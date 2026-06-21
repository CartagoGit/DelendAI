---
name: mcp-vertex-token-budget-discipline
appliesTo: ['@mcp-vertex/core']
description: Which mcp-vertex tools are cheap to call from the root/orchestrating thread and which ones must be delegated to a subagent because their verbose form is expensive. Use before calling any tool whose name doesn't already say "compact". For the deep methodology behind the regression gate itself, see token-budget-playbook.
---

# mcp-vertex token budget discipline

## Decision tree

1. About to orient at the start of a session? -> `mcp-vertex_overview { compact: true }`,
   not the full form.
2. About to check proposal state? -> `proposals_auto_work` /
   `proposals_compact_status`, not `proposal_board` verbose.
3. About to call a tool with no `compact` flag and a potentially large
   result (`search`, `state_health`, `audit_consolidate`)? -> bound it
   (`maxResults`, `scope`) or delegate the call to a subagent.
4. Slice closed and about to start unrelated work? -> `/compact` before
   continuing; don't carry its tool output forward.

## Measured budgets (current baseline)

From `docs/TOKEN-BUDGETS.md`, captured against a real assembled server
(`--plugins=proposals,memory`, 26 tools) via
`packages/core/tests/src/lib/e2e/token-budget.e2e.spec.ts`:

| Cold-start call | Bytes | ~ tokens | Enforced ceiling (bytes) |
|---|---:|---:|---:|
| `overview` (full) | 6 735 | ~1 684 | 7 000 |
| `overview { compact: true }` | 1 271 | ~318 | 1 600 |
| `auto_work` (idle) | 159 | ~40 | — |
| `auto_work` (work plan) | 1 026 | ~257 | 1 600 |

Plus an invariant: `compact < full × 0.7` — compact must be a real saving,
not cosmetic. A full cold-start orientation (`overview compact` +
`auto_work` idle) costs ~358 tokens total.

Additional surfaces tracked (not yet hard-gated, but bounded):
`search_search` (≤3 000 B), `docs_docs_list` (≤2 500 B),
`proposals_round_context` (≤3 000 B), `logs_tail` (≤4 000 B).

## Compact-native vs verbose — compact first, then drill

| Verbose | Compact-native equivalent |
|---|---|
| `mcp-vertex_overview` (default) | `mcp-vertex_overview { compact: true }` |
| `proposal_board` | `proposals_auto_work` / `proposals_compact_status` |
| `state_health` (full dump) | `proposals_compact_status` for routine checks |
| `audit_consolidate` (no scope) | `audit_consolidate { auditDir: <narrow> }` |
| `search_search` (no `maxResults`) | `search_search { maxResults: <=50 }` |

Rule: call the compact form first; only drill into the verbose form when the
compact answer is insufficient for the decision you're making right now.

## Tools to never call from the main thread

Per `CLAUDE.md`'s "keep the main thread cheap" rule — delegate these to the
`mcp-vertex-orchestrator` subagent so the verbose payload is absorbed there:

- `proposal_board` in its verbose form.
- `state_health` full dumps.
- `audit_consolidate` with no scope/`auditDir` filter.
- `search` with `maxResults > 50`.

## Regression gate

`packages/core/tests/src/lib/e2e/token-budget.e2e.spec.ts` fails the build
if `overview` (full or compact) or `auto_work` regresses past the ceilings
in the table above, or if the `compact < full × 0.7` invariant breaks. If
you touch `overview-tool.ts` or `auto-work.tool.ts` and this spec turns red,
that is the discipline working as intended — shrink the payload back down
rather than raising the ceiling.

## Never do

- Never call `proposal_board` verbose, `state_health` full, or unscoped
  `audit_consolidate` directly from the root/coordinator thread.
- Never assume a tool without a `compact` parameter is automatically cheap —
  check `docs/TOKEN-BUDGETS.md` or bound it explicitly (`maxResults`, `scope`).
- Never carry a closed slice's verbose tool output into unrelated work —
  `/compact` first.

## Smoke

```
bunx vitest run packages/core/tests/src/lib/e2e/token-budget.e2e.spec.ts
```
Should stay green; a failure means a payload exceeded its budget in the
table above.
