# Token budgets — measured baseline

`@mcp-vertex/core` promises *low-token*. This is the measured proof, not
marketing. Numbers are **payload bytes** of the tool result text an agent sees
(≈ 4 bytes/token), captured by driving the **real** assembled server over the MCP
protocol (`packages/core/tests/src/lib/e2e/token-budget.e2e.spec.ts`).

## Baseline (2026-06-21)

Server: `--plugins=proposals,memory` (26 tools registered).

| Cold-start call | Bytes | ≈ tokens | Notes |
|---|---:|---:|---|
| `overview` (full) | 6 735 | ~1 684 | Every tool with summary + knowledge ids + paths. |
| `overview { compact: true }` | 1 271 | ~318 | Names only — **5.3× cheaper**. Use this first when there are many tools. |
| `auto_work` (idle) | 159 | ~40 | Explicit idle state, not prose. |
| `auto_work` (work plan) | 1 026 | ~257 | One tight action plan plus a compact delegation policy. |

A full cold-start orientation is therefore **~318 tokens** (`overview compact`) +
**~40** (`auto_work` idle) ≈ **~358 tokens** when no proposal is actionable; with
an actionable proposal, `auto_work` stays around **~257 tokens** and also tells the
agent whether to delegate expensive inspection.

## Enforced budgets (regression guard)

The benchmark spec fails if a change regresses these ceilings:

| Payload | Budget (bytes) |
|---|---:|
| `overview` full | 7 000 |
| `overview` compact | 1 600 |
| `auto_work` | 1 600 |

Plus an invariant: `compact < full × 0.7` (the compact mode must stay a real
saving, not cosmetic).

## Reproduce

```bash
bun run test            # includes the e2e token-budget benchmark
# or just the benchmark:
bunx vitest run packages/core/tests/src/lib/e2e/token-budget.e2e.spec.ts
```

## Why these stay low

- `overview` is one cold-start call (no tool-by-tool probing); `compact`/`tag`
  shrink it further.
- `auto_work` tells agents when to stop doing research in the root chat and use
  `continue_proposal mode:"plan"` + `delegate` for non-trivial slices.
- Knowledge is lazy (MCP resources) — bodies are fetched only on demand.
- Tool responses are compact JSON (`toolJson`/`toolOk`/`toolError`), no
  pretty-print; persisted files stay human-readable but are never the payload.
- `git diff --stat`, `quality` tail, `search` caps and `memory_list` pagination
  bound the large outputs.
- With `--plugins=notification`, agents react to `lock-released` pushes instead
  of polling `agent_lock status` (the dominant token sink in real swarms).
