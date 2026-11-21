# @delendai/logs

Persistent append-only, redacted, **incident-driven** event log plugin for
`@delendai/core`. v0.1.0+ ships **9 tools** (6 read + 1 write + 1 content
search + 1 auto-detector), a syslog 7-level severity taxonomy, a
`kind → incidentType` table, and a `ctx.logs.log()` cross-plugin helper so
peer plugins can record structured incidents without writing JSONL by hand.

Load it with:

```bash
delendai --plugins=logs
```

## Storage

The plugin writes redacted JSONL records under two independently-retained
streams:

- `.cache/delendai/results/logs/` — every event (the full timeline).
- `.cache/delendai/results/logs-errors/` — only events whose outcome is
  not `ok`/`idle` (failed, timed-out, dead, cancelled, unknown), each with
  full context (args, error message + stack, `elapsedMs`). Start here when
  debugging or auditing — it points at exactly where execution didn't reach
  the state you expected, before you read a single source file.

Both streams are day-rotated JSONL, capturing tool start/completion/failure/
cancellation through the core instrumentation hooks, and are each retained
independently to the newest `retentionCount` files (default 10, oldest
dropped first — see `plugins.logs.options.retentionCount` in
`delendai.config.json`), so history from earlier sessions survives as long
as it fits that window.

## Fields on every event

Every record is a JSON object with the same shape, regardless of which tool
returned it:

| Field          | Type                | Meaning                                                                  |
| -------------- | ------------------- | ------------------------------------------------------------------------ |
| `ts`           | ISO 8601 string     | When the event was emitted.                                              |
| `kind`         | string              | Lifecycle hook (`tool-started`, `tool-failed`, `agent-dead`, …).         |
| `outcome`      | enum                | `ok` / `failed` / `timed-out` / `cancelled` / `dead` / `idle` / `unknown` |
| `severity`     | enum (syslog 7)     | `debug` / `info` / `notice` / `warning` / `error` / `critical` / `alert` / `emergency` |
| `incidentType` | string \| null      | Stable lower-case slug (`tool-failure`, `state-inconsistency`, …)        |
| `agent`        | string \| null      | Top-level agent identity (from `args.agent` or `args.agentName`).        |
| `files`        | string[]            | Top-level file paths touched (from `args`/`result`).                     |
| `taskId`       | string \| null      | Per-tool task id, used by `correlate`.                                   |
| `summary`      | string (≤200 chars) | One-line redacted summary.                                                |
| `meta`         | object              | Full payload — `args`, `result`, `error.message`, `error.stack`, `elapsedMs`, `callId`. |

`severity` and `incidentType` are the operator-facing primitives f00153 adds.
`severity` defaults to `severityForOutcome(outcome)` so an `outcome: failed`
event is `severity: error` without any caller involvement. `incidentType`
defaults to `KIND_TO_INCIDENT_TYPE[kind]` (e.g. `tool-failed` →
`tool-failure`, `state-inconsistency-detected` → `state-inconsistency`).
Both fields are first-class on every event — no need to dig into `meta` to
filter by them.

## Tools (9)

The plugin exposes 9 MCP tools. Tool names below are the canonical ones
(no namespace prefix); the actual registered names are
`<namespacePrefix>_<name>` (default `logs_<name>`).

### Read

#### `query` — filter the timeline

```text
input:  { since?, until?, kind?, agent?, taskId?, outcome?, severity?, incidentType?, limit?, cursor? }
output: { events: LogEvent[], cursor: string | null, hasMore: boolean }
```

- `severity` is **inclusive lower bound** (`error` matches `error` /
  `critical` / `alert` / `emergency`).
- `incidentType` is exact match.
- `cursor` is opaque; pass it back to get the next page.
- Default `limit: 100`, max 1000.

#### `tail` — newest events, optionally filtered

```text
input:  { limit?, outcomeFilter?, kindFilter?, includeMeta? }
output: { events: LogEvent[], oldestTs: string | null, newestTs: string | null }
```

`includeMeta` defaults to `false` (cheap projection; `meta` is stripped).

#### `errors_tail` — curated error stream (start here when debugging)

```text
input:  { limit?, kindFilter?, includeMeta? }
output: { events: LogEvent[], oldestTs: string | null, newestTs: string | null }
```

Reads **only** the curated `logs-errors/` stream. `includeMeta` defaults to
`false` (cheap projection; `meta` is stripped) so a debugging session cannot
overflow the host context. Pass `includeMeta:true` only for the one event you
are inspecting.

#### `correlate` — chronological chain + gap detection

```text
input:  { taskId?, agent?, since?, until? }   // exactly one of taskId | agent
output: { chain: LogEvent[], firstTs, lastTs, gaps: { startTs, endTs, durationMs }[] }
```

A `gap` is any interval in the chain longer than 60 s. Useful to spot an
agent that went silent between two events.

#### `subscribe` — SSE-friendly projection

```text
input:  { outcomeFilter?, kindFilter?, limit? }
output: { events: LogEvent[], stream: 'logs' }
```

Web SSE endpoints poll this read-only tool.

### Write

#### `log` — record a structured incident (f00153)

```text
input:  {
  severity:     'debug'|'info'|'notice'|'warning'|'error'|'critical'|'alert'|'emergency',  // default 'warning'
  incidentType: string,            // must match ^[a-z][a-z0-9-]{0,63}$
  message:      string,            // required
  files?:       string[],
  agent?:       string,
  context?:     Record<string, unknown>
}
output: { ok: true, ts: string, incidentType: string, severity: Severity }
```

Writes a single event to the main timeline. When `severity` is `error` or
above, the event **also** lands in the curated error stream, so existing
`errors_tail` consumers pick it up without code changes. Invalid `incidentType`
slugs return a structured `toolError`.

### Read (content)

#### `search` — full-text / regex over event content (f00153)

```text
input:  {
  pattern:       string,                              // required
  caseSensitive?: boolean,                            // default false
  isRegex?:       boolean,                            // default false (substring)
  scope?:         'summary' | 'error' | 'args' | 'result' | 'all',  // default 'all'
  limit?:         number,                             // default 100, max 1000
  since?:         string,
  until?:        string
}
output: { events: LogEvent[], matched: number, hasMore: boolean }
```

Searches **both** streams in parallel, dedupes by `(ts, summary, kind)`.
`scope: 'error'` is the fast path for "find every occurrence of a known
error message". Invalid regex returns a structured `toolError`.

#### `incidents` — auto-detector (f00153)

```text
input:  { since?, until?, minCount?, agent?, recentLimit? }
output: {
  incidents: Array<{
    incidentType, toolName, count, distinctAgents,
    firstSeen, lastSeen, sampleSummary, sampleError,
    recentEvents: LogEvent[]
  }>,
  totalIncidents: number
}
```

Reads the curated error stream and clusters failing events by
`(toolName, sha1(error.message).slice(0,16))`. Returns **one record per
cluster** with `count`, `distinctAgents`, `firstSeen`, `lastSeen`,
`sampleSummary`, `sampleError` and the most recent `recentEvents[]`
(default 5). Clusters with fewer than `minCount` matches (default 2) are
dropped.

> **Start here when an agent asks "what is broken right now?"** — this
> tool returns the same bug many times, ONCE.

### Security

#### `redact_test` — audit the redactor

```text
input:  { text: string }
output: { detected: string[], redacted: string }
```

Runs the shared `redactSecrets` against a sample payload and returns the
list of high-confidence pattern names (`github-token`, `aws-access-key`,
`jwt`, `private-key`, `bearer`, `assignment`, `github-pat`).

## Cross-plugin helper — `ctx.logs.log()`

Other plugins can record structured incidents without depending on
`@delendai/logs` at compile time:

```ts
import type { IPluginLogInput } from '@delendai/core';

await ctx.logs?.log({
  severity: 'critical',
  incidentType: 'lock-conflict',
  message: 'agents/proposals.lock held > 30s by agent peer-1',
  files: ['agents/proposals.lock'],
  agent: 'peer-1',
  context: { lockPath: 'agents/proposals.lock', heldMs: 32_000 },
});
```

The helper is the same writer `logs_log` uses, so the entry is queryable by
`query` / `search` / `incidents` with the same severity / incidentType. The
helper is conditional on the `logs` plugin being loaded — null-check before
calling (`ctx.logs?.log(...)`).

## Recipe — "what is broken right now?"

1. `logs_incidents { minCount: 2 }` — recurring cluster view.
2. For the top cluster, take `sampleError` and pass it to
   `logs_search { pattern: <sampleError>, isRegex: true, scope: 'error' }`
   to see every occurrence with full context.
3. `logs_correlate { taskId: <toolName> }` — what happened before/after
   the first occurrence.
4. For an ad-hoc diagnostic, call `logs_log { severity: 'critical',
   incidentType: 'lock-conflict', message: '...', context: { ... } }` so
   a future `logs_search` can find it.

## Configuration

```jsonc
// delendai.config.json
{
  "plugins": {
    "logs": {
      "options": {
        "retentionCount": 10
      }
    }
  }
}
```

| Option           | Type   | Default | Effect                                                              |
| ---------------- | ------ | ------- | ------------------------------------------------------------------- |
| `retentionCount` | number | 10      | Newest N **files** (one per day) kept per stream; oldest dropped.   |

The two streams (`logs/` and `logs-errors/`) are retained independently so
a burst of errors cannot starve the main timeline's window or vice versa.

## Public API

```ts
import {
  // store
  createLogStore,
  // event normalization
  normalizeEvent,
  serializeRedactedEvent,
  isErrorOutcome,
  outcomeForKind,
  // severity + incidentType
  LOG_SEVERITIES,
  KIND_TO_INCIDENT_TYPE,
  INCIDENT_TYPE_PATTERN,
  isValidIncidentType,
  severityForOutcome,
  incidentTypeForKind,
  // search + clustering
  logSearch,
  logIncidents,
  // correlation
  correlateEvents,
  // subscription bus
  subscribeToBus,
  // redaction
  redactTest,
} from '@delendai/logs/public';
```

Types: `ILogEvent`, `ILogStore`, `ILogRangeFilter`, `ILogTailOptions`,
`LogEventKind`, `LogOutcome`, `LogSeverity`, `IncidentType`,
`ILogSearchOptions`, `ILogSearchResult`, `ILogIncident`, `ILogIncidentsOptions`,
`ILogIncidentsResult`, `ICorrelateOptions`, `ILogGap`,
`ILogBusSubscription`, `ILogEventBus`, `LogBusEventKind`.
