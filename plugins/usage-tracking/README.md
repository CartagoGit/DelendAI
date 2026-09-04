# @delendai/usage-tracking

The observability plugin for [`@delendai/core`](../../packages/core). It
records **every** tool invocation across every loaded plugin to an
append-only log under the cache dir, and surfaces aggregate usage + cost
reports by **agent**, **plugin**, **model** and **extension**.

Load it with:

```sh
delendai --plugins=usage-tracking
```

## What it records

For each tool call it writes one NDJSON row to
`${cacheDir}/usage-tracking/invocations.jsonl`:

```jsonc
{
  "ts": "2026-06-25T14:32:11.482Z",
  "sessionId": "s_8f3a…",
  "agent": { "id": "Claude Code", "kind": "claude-code", "extension": "claude-code" },
  "plugin": "proposals",
  "tool": "auto_work",
  "model": null,                 // set only for orchestrated calls
  "usage": null,                 // set when the provider reports tokens
  "tokenAccounting": {            // local, metadata-only comparison
    "baselineTokens": null,
    "usedTokens": null,
    "tokensSaved": null,
    "savingsPercent": null,
    "status": "unavailable",     // measured | estimated | unavailable
    "basis": "no explicit token baseline reported"
  },
  "costUsd": null,               // computed from pricing.json + usage
  "durationMs": 4820,
  "outcome": "success",           // success | error | timeout | fallback
  "fallbackFrom": null,
  "error": null
}
```

**Metadata only** — message content is never written to disk, and every
record is piped through the core's `redactSecrets` before it lands, so a
credential an agent happened to see is never persisted.

## Per-call token savings

When a provider reports token usage, the plugin can calculate savings locally
without making another LLM request. Configure an explicit baseline per tool or
plugin:

```jsonc
{
  "plugins": {
    "usage-tracking": {
      "options": {
        "tokenBaselines": {
          "orchestrator-runner/invoke": 1200,
          "memory/*": 800
        }
      }
    }
  }
}
```

The exact `plugin/tool` key wins over `plugin/*`. For a call with a baseline
of 1200 tokens and provider usage of 900 tokens, the row records 300 saved
tokens and a 25% saving. Calls without provider usage or without a defensible
baseline remain `unavailable`; the plugin never guesses tokens from character
counts. Legacy rows and tools that already report `tokensSaved` are preserved
as `estimated` when no comparable baseline exists.

## Checkpoint advisories (f00156)

`SessionHygieneMonitor` newly-breached reasons map to
`SESSION_TOO_LONG` (`recommend`; `strong` when several independent
thresholds fire). Age alone never blocks. Configure via
`plugins.usage-tracking.options.sessionHygiene`. See
[`CHECKPOINT-ADVISORIES.md`](../../docs/delendai/CHECKPOINT-ADVISORIES.md).

## Durable, non-blocking append

Recording is on the tool **hot path**, so it must never block. `push()`
is O(1) and touches no disk: it snapshots the record in memory and
schedules a flush. The background writer coalesces records into at most
**one append per 250ms window OR per 64 entries** (whichever first), so a
burst of 1000 calls costs a handful of appends, not 1000 fsyncs (p99 push
latency stays well under 5ms). Every flush appends via
`fs/promises.appendFile` guarded by a single shared `withFileMutex` — a
safe async append, never a read-modify-write of the growing log.

## Rollups

Every 5 minutes the log is folded into
`${cacheDir}/usage-tracking/usage-summary.json`, bucketed by provider,
plugin, agent and extension. The same fold powers the report tool
on demand.

## Session hygiene

The plugin also observes each local MCP session: activity span, gaps between
tool calls and MCP response volume. It is deliberately **not** a Claude/Codex
conversation meter or subscription-quota estimate. A single advisory logging
message is emitted per breached reason, so warnings do not create a tool-call
loop or extra context churn.

Defaults are a two-hour observed activity span, a 30-minute observed gap and
8k estimated tokens of MCP output. Configure them under
`plugins.usage-tracking.options.sessionHygiene`; set `enabled: false` to turn
off advisory logging while retaining the read-only report.

## Pricing

`${cacheDir}/usage-tracking/pricing.json` is refreshed from LiteLLM's
`model_prices_and_context_window.json` with a **24h TTL** using a
stale-while-revalidate pattern and a hard **1s timeout** — the fetch never
blocks tool execution, and when LiteLLM is unreachable the bundled
`resources/pricing.snapshot.json` is authoritative.

**Subscription providers** (Claude Code Max, Copilot, …) report **no**
per-call price: a fixed subscription cost is not a marginal per-call cost,
so `costUsd` stays `null` and the report reasons about *whether the
subscription is worth renewing*, not per-call spend.

## Tools

- **`<prefix>_usage_report {groupBy, windowDays, filter, sortBy, limit}`** —
  returns the totals block, the bucketed rollup for the chosen axis
  (`provider` | `plugin` | `agent` | `extension`), and the top-10 most
  expensive calls.
- **`<prefix>_usage_clear {confirm}`** — truncates the log + summary.
  Destructive; requires `confirm: true`.
- **`<prefix>_session_hygiene {limit}`** — reports current and durable local
  MCP-session observations plus the active thresholds. It explicitly labels
  every result as MCP-only.

## Agent / extension detection

The agent behind a call is resolved from the MCP `clientInfo.name` (which
the host surfaces on `ctx.hostIdentity.host`) through a static table
covering GitHub Copilot Chat, Claude Code, Codex CLI, Cursor, Aider,
Continue, plus the headless `cli-doctor` / `cli-direct` hosts. Unknown
clients can be named without a code change via
`plugins.usage-tracking.options.clientMap`:

```jsonc
{
  "plugins": {
    "usage-tracking": {
      "options": {
        "clientMap": {
          "My Custom IDE": { "kind": "my-ide", "extension": "my-ide" }
        }
      }
    }
  }
}
```

The plugin **never** sniffs `process.env` for vendor-specific variables.

## Options

| Option                                | Default  | Meaning                                                                                                   |
| ------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------- |
| `clientMap`                           | –        | `clientInfo.name` → `{kind, extension}` overrides                                                         |
| `tokenBaselines`                      | –        | Explicit token baselines keyed by `plugin/tool` or `plugin/*`; used only when provider usage is available |
| `maxBatch`                            | `64`     | records buffered before a forced flush                                                                    |
| `maxDelayMs`                          | `250`    | max ms a record waits before a flush                                                                      |
| `windowDays`                          | `7`      | rollup window for the periodic summary                                                                    |
| `summaryIntervalMs`                   | `300000` | how often the summary is regenerated                                                                      |
| `sessionHygiene.enabled`              | `true`   | emit one-shot local MCP-session advisories                                                                |
| `sessionHygiene.maxSessionAgeMinutes` | `120`    | observed MCP activity span before an advisory                                                             |
| `sessionHygiene.maxIdleGapMinutes`    | `30`     | observed gap between MCP calls before an advisory                                                         |
| `sessionHygiene.maxMcpOutputTokens`   | `8000`   | estimated MCP response volume before an advisory                                                          |

## License

BSD-3-Clause © Cartago
