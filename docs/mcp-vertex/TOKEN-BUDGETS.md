# Token budgets — measured baseline

`@mcp-vertex/core` promises *low-token*. This is the measured proof, not
marketing. Numbers are **payload bytes** of the tool result text an agent sees
(≈ 4 bytes/token), captured by driving the **real** assembled server over the MCP
protocol (`packages/core/tests/src/lib/e2e/token-budget.e2e.spec.ts`).

## Baseline (2026-07-24)

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

The benchmark spec (`token-budget.e2e.spec.ts`) fails if a change regresses
these ceilings — these are the CURRENT values in the spec, refreshed 2026-07-14
(x00101); the spec itself is always the source of truth:

| Payload | Budget (bytes) | Notes |
|---|---:|---|
| `overview` full | 9 700 | grows with the toolset; compact is the promise |
| `overview` compact | 1 250 | |
| `agent_catalog` compact | 900 | default orientation projection (lean skills, no tool list) |
| `agent_catalog` full | 6 800 | |
| `auto_work` | 1 600 | |
| `analyze_project` **default** | 1 800 | bare `{}` returns the summary since x00101; `full:true` opts in |
| `plan_mcp_project` **default** | 2 000 | bare `{}` returns the summary since x00101; `full:true` opts in |

### Real host preset regression budgets

The repository host defaults to the collaboration preset. Its static tool
definitions are deliberately measured separately from tool-result payloads:

| Surface (fixture server) | Baseline | Budget | Why |
|---|---:|---:|---|
| collaboration `tools/list` | 157 504 B | 165 000 B | The actual static MCP schema surface exposed by the default host. |
| collaboration `overview { compact: true }` | 2 463 B | 2 750 B | The recommended first orientation call. |
| collaboration resume digest | 146 B | 300 B | The normal continuation path. |
| lightweight `tools/list` | 58 003 B | 65 000 B | The explicit simple-task surface; it must remain under 40% of collaboration's budget. |

The benchmark assembles both presets over the in-memory MCP transport. It does
not silently change the default collaboration preset: use `--preset=lean` when
the task only needs version control, search, memory and docs.

Two structural invariants behind those numbers:

- `compact < full × 0.7` (the compact mode must stay a real saving, not cosmetic).
- **Compact is the default** on the tools whose full payload is unbounded on
  real projects: `plan_mcp_project {}` measured 205 963 B (~51k tokens) against
  this repo before x00101 flipped the default; the same call now returns the
  ~900 B summary and `full:true` is the explicit opt-in. `rules_get_rules`
  keeps its full default (orientation material) but exposes `compact: true`
  (~12 KB → <1.5 KB).

### Real-workspace scaling (this repo: 13 plugins, ~89 tools)

Live measurements over stdio against `--workspace=.` (2026-07-14):

| Call | Bytes |
|---|---:|
| `overview { compact: true }` | 2 278 |
| `agent_catalog { mode: "compact" }` | 2 321 (was 14 103 before the orientation projection) |
| `analyze_project {}` | ~900 (was 12 933) |
| `plan_mcp_project {}` | ~900 (was 205 963) |

Beyond the e2e, the longitudinal metrics gate (`bun run metrics:gate`, CI job
`metrics-gate`) diffs bytes/call per tool against the release baseline — or the
repo-tracked fallback `config/metrics-baseline.json` before the first release —
and fails on a >20 % regression.

Host lifecycle counters are intentionally not included in these MCP payload
budgets. Claude's optional command-hook adapter appends only an opaque session
id, event and timestamp locally; it returns no MCP result on ordinary user
turns. Its pre-compaction advisory is a small, boundary-only result, not a
per-turn context cost.

## Additional read-only surfaces (tracked next)

The cold-start gate above is the **hard regression guard** today. The next
surfaces that matter in long sessions are already bounded and are now tracked by
the same metrics pipeline / e2e fixture, even if they are not yet given their
own longitudinal gate thresholds:

| Surface | Current ceiling (bytes) | Why it matters |
|---|---:|---|
| `search_search` | 3 000 | Workspace grep-like lookup is often the first expensive step after orientation. |
| `docs_docs_list` | 2 500 | Cheap docs index should stay cheaper than `docs_read` or broad search. |
| `proposals_round_context` | 3 000 | Resumed swarm work depends on this digest path instead of broad re-reading. |
| `logs_tail` | 4 000 | Operational observability must stay bounded even after a few tool calls. |

These are measured on a tiny fixture workspace in the token-budget e2e and are
good candidates for future longitudinal thresholds. They are **bounded and
tracked**, but not yet promoted to the same hard release gate status as
`overview` and `auto_work`.

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
- `search`, `docs`, `round_context` and `logs` each have their own cheap path
  (`maxResults`/context clamps, paginated index, digest-only summary, tail with
  bounded window) so they can be tracked without measuring their verbose cousins.
- Knowledge is lazy (MCP resources) — bodies are fetched only on demand.
- Tool responses are compact JSON (`toolJson`/`toolOk`/`toolError`), no
  pretty-print; persisted files stay human-readable but are never the payload.
- `git diff --stat`, `quality` tail, `search` caps and `memory_list` pagination
  bound the large outputs.
- With `--plugins=notification`, agents react to `lock-released` pushes instead
  of polling `agent_lock status` (the dominant token sink in real swarms).
- `overview`'s `pluginDiagnostic.missingReasons` only appears when a configured
  plugin failed to load, mapping each `missing` name to why — so the
  configured/loaded divergence stays explicit without a verbose dump, and the
  all-clear shape (the common case) is unchanged.
