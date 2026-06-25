# 08 — Plugin `usage-tracking`

The dedicated observability plugin the user asked for on 2026-06-25:

> *"Igual una herramienta o plugin extra para saber todo el consumo
> realizado por cada agente del mcp-vertex, por cada plugin, por cada
> modelo, y por cada extension"*

A single plugin that records every tool invocation across all of
`mcp-vertex` and exposes aggregate views by **agent**, **plugin**,
**model**, and **extension** (VS Code, Cursor, Claude Code, …).

---

## What it owns

- **`${cacheDir}/usage-tracking/invocations.jsonl`** — append-only NDJSON log.
- **`${cacheDir}/usage-tracking/usage-summary.json`** — periodically
  refreshed rollups (every 5 min via a tick on tool completion).
- **`<prefix>_usage_report`** MCP tool — query the rollups.
- **`IHostObservability.onToolCall`** — extension point (already
  exists) is wired in here. The plugin subscribes; every other
  plugin's tool calls pass through it.

It does **not** own:

- Token-counting policy (each provider exposes its own
  `usage` shape; the plugin normalizes but doesn't invent).
- Quota state (that's `orchestrator-runner`'s job; this plugin
  writes to the same `quotas.json` but doesn't own its TTL).
- Cost calculation in fiat (each provider has its own pricing;
  the plugin keeps a pricing table in
  `${cacheDir}/usage-tracking/pricing.json`, refreshed from
  LiteLLM's `model_prices_and_context_window.json` with 24h TTL).

---

## The log format

`${cacheDir}/usage-tracking/invocations.jsonl`:

```jsonc
{
  "ts": "2026-06-25T14:32:11.482Z",
  "sessionId": "s_8f3a...",
  "agent": {                       // the MCP caller
    "id": "copilot-chat-1",
    "kind": "copilot",             // detected from MCP clientInfo.name or env
    "extension": "vscode"
  },
  "plugin": "proposals",            // plugin that owns the tool
  "tool": "auto_work",              // tool name
  "model": {                       // model that handled the call (if known)
    "provider": "copilot-m3",       // provider id from the roster
    "modelId": "MiniMax-M3",
    "kind": "subscription"
  },
  "usage": {                       // when reported by the provider
    "inputTokens": 1247,
    "outputTokens": 318,
    "totalTokens": 1565
  },
  "costUsd": 0.0021,               // computed from pricing.json + usage
  "durationMs": 4820,
  "outcome": "success",             // success | error | timeout | fallback
  "fallbackFrom": null,             // if this was a fallback, who was tried first
  "error": null                    // { code, message } when outcome != success
}
```

**Append-only.** No rotations, no deletes, no PII. The file grows
linearly with usage; pruning is left to the user (the file is in
their cache, their OS handles it).

---

## The rollups

`${cacheDir}/usage-tracking/usage-summary.json`:

```jsonc
{
  "updatedAt": "2026-06-25T14:35:00Z",
  "windowDays": 7,
  "totals": {
    "calls": 1284,
    "inputTokens": 1240500,
    "outputTokens": 318200,
    "totalTokens": 1558700,
    "costUsd": 18.42,
    "errors": 7
  },
  "byProvider": [
    { "id": "claude-code-opus",   "calls": 14,  "totalTokens": 187000, "costUsd":  8.20, "usedPctOfQuota": 43.2 },
    { "id": "codex-gpt-5.5",      "calls": 87,  "totalTokens": 412000, "costUsd":  6.10, "usedPctOfQuota": 37.4 },
    { "id": "openrouter-sonnet",  "calls": 412, "totalTokens": 643000, "costUsd":  3.10, "usedPctOfQuota": 12.3 },
    { "id": "copilot-m3",         "calls": 771, "totalTokens": 316700, "costUsd":  1.02, "usedPctOfQuota":  0.0 }
  ],
  "byPlugin": [
    { "plugin": "proposals",       "calls": 12,   "costUsd":  4.20 },
    { "plugin": "audit",           "calls":  3,   "costUsd":  6.50 },
    { "plugin": "docs",            "calls": 47,   "costUsd":  0.85 },
    { "plugin": "orchestrator-runner", "calls": 230, "costUsd": 3.40 }
  ],
  "byAgent": [
    { "agent": "copilot-chat-1",   "calls": 412,  "costUsd":  8.10 },
    { "agent": "claude-code-1",    "calls": 187,  "costUsd":  6.20 },
    { "agent": "codex-cli-1",      "calls": 685,  "costUsd":  4.12 }
  ],
  "byExtension": [
    { "extension": "vscode-copilot", "calls": 412, "costUsd": 8.10 },
    { "extension": "claude-code",    "calls": 187, "costUsd": 6.20 },
    { "extension": "codex-cli",      "calls": 685, "costUsd": 4.12 }
  ]
}
```

Generated every 5 min from `invocations.jsonl`. Cheap to compute
even for tens of thousands of lines (Python-level groupby on JSONL
takes <100ms for 10k entries in Bun).

---

## Agent / extension detection

`agent.id`, `agent.kind`, `agent.extension` come from:

1. **MCP `clientInfo`** — every MCP client sends
   `clientInfo: { name, version }` in the `initialize` request.
   Mapped through a static table:

   | `clientInfo.name` | `kind` | `extension` |
   |---|---|---|
   | `GitHub Copilot Chat` | `copilot` | `vscode-copilot` |
   | `Claude Code` | `claude-code` | `claude-code` |
   | `Codex CLI` | `codex` | `codex-cli` |
   | `Cursor` | `cursor` | `cursor` |
   | `Aider` | `aider` | `aider` |
   | `Continue` | `continue` | `continue` |
   | _unknown_ | `unknown` | `unknown` |

2. **`process.argv[0]`** as a fallback when `clientInfo` is
   misleading.

3. **A static allowlist of unknown values** that the user can
   extend in config.

The plugin **never** sniffs `process.env` for vendor-specific
variables (we said we wouldn't, in
[`02-our-infrastructure.md`](02-our-infrastructure.md) §4).

---

## The query tool

`<prefix>_usage_report`:

```typescript
{
  groupBy: "provider" | "plugin" | "agent" | "extension";
  windowDays?: number;   // default 7
  since?: string;        // ISO date; overrides windowDays if set
  filter?: {
    provider?: string;
    plugin?: string;
    agent?: string;
    outcome?: "success" | "error" | "timeout" | "fallback";
  };
  sortBy?: "calls" | "totalTokens" | "costUsd";
  limit?: number;        // default 20
}
```

Returns the rollup slice + a list of "expensive calls" (top 10 by
cost or duration, for the user to inspect). No PII; no message
content.

---

## Pricing table

`${cacheDir}/usage-tracking/pricing.json`:

```jsonc
{
  "updatedAt": "2026-06-25T14:00:00Z",
  "source": "https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json",
  "models": {
    "anthropic/claude-opus-4-8": {
      "inputCostPer1k": 0.015,
      "outputCostPer1k": 0.075,
      "contextWindow": 200000,
      "supportsVision": true
    },
    // ...
  }
}
```

Refreshed by a small `tools/scripts/refresh-pricing.script.ts` (or
by the plugin on startup, gated by a 24h TTL — same pattern as
Aider's `ModelInfoManager`).

> **CRITICAL I6 fix (2026-06-25):**
> 1. The LiteLLM URL is already covered by the default
>    `mcp-vertex.config.json#plugins.web-fetch.options.allowList`
>    (`raw.githubusercontent.com`).
> 2. **Fallback when LiteLLM is down:** the plugin ships a bundled
>    `pricing.json` (snapshot from the last successful fetch) at
>    `${pluginSource}/resources/pricing.snapshot.json`. The cache
>    file falls back to this if the fetch fails and there's no
>    prior cache.
> 3. **For subscription providers (CRITICAL N4 fix):** the metric
>    `costUsd / call` is **meaningless** (Opus on Claude Code Max
>    has marginal cost $0). The report uses
>    `{ kind: "subscription", tier: "pro", subscriptionUsd: 20,
>    marginalCostUsd: null, fixedCost: true }` and the LLM-as-cost-
>    analyst reasons about *whether the subscription is worth
>    renewing*, not per-call.

---

## What this plugin does NOT do

- **No content logging.** Message text is never written to disk. The
  log records metadata only.
- **No quota enforcement.** It observes; `orchestrator-runner`
  enforces.
- **No cross-host sync.** The log is per-`mcp-vertex` instance. If
  you run `mcp-vertex` on three machines, you have three logs.
  Cross-host aggregation is a future plugin.
- **No LLM involvement in the log path.** The plugin **builds** the
  record synchronously in the `onToolCall` hook and enqueues it; a
  background writer batches appends via `writeFileAtomic` under a
  single shared `withFileMutex`, flushing at most once per **250ms**
  or **64 entries** (whichever first). **CRITICAL C2 fix (2026-06-25):**
  this is not a per-call fsync — that would violate AGENTS.md rule
  3 ("async I/O only in hot paths") and would trash the orchestrator's
  own latency under load. The 250ms / 64-entry throttle is the
  proven pattern from the notification plugin's recent fix
  (a00032 S3).

---

## Files to add (estimate)

| File | Lines | Notes |
|---|---|---|
| `plugins/usage-tracking/package.json` | 30 | |
| `plugins/usage-tracking/tsconfig.json` | 20 | |
| `plugins/usage-tracking/vitest.config.ts` | 15 | |
| `plugins/usage-tracking/README.md` | 150 | |
| `plugins/usage-tracking/src/index.ts` | 80 | `register()` + hook subscription |
| `plugins/usage-tracking/src/lib/record.ts` | 150 | append-only NDJSON writer |
| `plugins/usage-tracking/src/lib/rollup.ts` | 250 | 5-min summary refresh |
| `plugins/usage-tracking/src/lib/pricing.ts` | 200 | LiteLLM fetch + cache |
| `plugins/usage-tracking/src/lib/detect-agent.ts` | 120 | clientInfo → kind/extension |
| `plugins/usage-tracking/src/lib/tools/report.tool.ts` | 200 | |
| `plugins/usage-tracking/src/lib/tools/clear.tool.ts` | 50 | explicit user action |
| `plugins/usage-tracking/src/public/index.ts` | 30 | barrel |
| `plugins/usage-tracking/tests/src/lib/**/*.spec.ts` | 600 | |
| `tools/scripts/refresh-pricing.script.ts` | 80 | CLI to refresh pricing.json |
| **Total** | **~1975** | |

Smaller than `orchestrator-runner` because there's no subprocess
lifecycle to manage. The plugin is mostly I/O and rollup.

---

## The MVP definition for this plugin

1. **NDJSON append on every tool call.** Use the existing
   `IHostObservability.onToolCall` and `IHostObservability.onToolStart`
   hooks (the latter provides `startedAt`; the former provides
   `endedAt` and `result`). No new contract.
2. **Detect agent via `clientInfo`.** Static table.
3. **Pricing table with LiteLLM fetch.** 24h TTL, bundled snapshot
   fallback.
4. **`<prefix>_usage_report` tool.** Group by all four axes.
5. **`<prefix>_usage_clear` tool.** Explicit user action, requires
   confirmation.

That's it. ~600 lines for the MVP, including tests.

---

## The relationship to `orchestrator-runner`

```
┌────────────────────┐         ┌──────────────────────┐
│  orchestrator-runner│         │   usage-tracking     │
│                    │  reads  │                      │
│  - routing         │ ──────▶ │  - invocations.jsonl │
│  - quota state     │         │  - usage-summary.json│
│  - fallback        │  writes │  - pricing.json      │
│  - spend advice    │ ◀────── │                      │
└────────────────────┘         └──────────────────────┘
                                       ▲
                                       │ hooks into
                                ┌──────┴───────┐
                                │ IHostObserv- │
                                │ ability.on-  │
                                │ ToolCall     │
                                └──────────────┘
                                       ▲
                                       │ called by
                              every other plugin
```

`orchestrator-runner` reads what `usage-tracking` writes. Both
plugins depend on the core's `IHostObservability` interface — no
direct coupling between them.

---

## The combined MVP (orchestrator-runner + usage-tracking)

What we should ratify as the first proposal:

1. Extend `mcp-vertex.config.json` schema with `providers` block at
   root. ~60 lines (schema) + 40 (Zod mirror).
2. Extend `IProposalSliceContract` with `requiresCapability`,
   `preferredProvider`, `maxCostTier`. ~30 lines.
3. Extend `ICatalogSnapshot` with `providers: IProviderSummary[]`.
   ~20 lines.
4. Build `plugins/usage-tracking` (MVP, ~600 lines + tests).
5. Build `plugins/orchestrator-runner` steps 1-5 from
   [`07`](07-plugin-orchestrator-runner.md) (~1200 lines + tests).
6. Add `redactSecrets` extension to learn
   `OPENAI_API_KEY = <value>` env-var pattern. ~20 lines.
7. Lint script to reject cleartext secrets in config. ~50 lines.
8. Docs: update `docs/mcp-vertex/wiki/04` and `05` to v2 (point at
   `06`/`07`/`08` for the new concerns).
9. Site i18n: add the 10 new tool strings × 12 languages. ~720
   lines (mostly mechanical).

**Total: ~2700 lines across 2 new plugins + 4 schema/contract
extensions + i18n + docs.**

That's a **multi-week slice proposal**, not a single PR. The natural
breakdown is:

- **Slice A:** schema extensions + `usage-tracking` MVP. (1 week,
  relatively low-risk, no subprocesses.)
- **Slice B:** `orchestrator-runner` steps 1-5. (1 week, mid-risk,
  bootstrap UX.)
- **Slice C:** steps 6-11 of `orchestrator-runner`. (1 week,
  higher-risk, subprocesses + fallback + spend advisor.)
