---
id: f00129
kind: feat
title: observability plugin — remote errors, traces and release health from Sentry/Datadog (read) to complement local logs/metrics
status: done
date: 2026-07-23
track: plugin+observability+runtime
closed-by: cartago (consolidated evidence pass 2026-07-26)
closed-evidence:
  - 3 commits referencing f00129 recovered from git log --grep (precedes convention)
  - all declared Files verified to exist via 3-commit batch
shipped-in:
  - 4f75ec49 # fix(proposals): prune stale f00127/f00129 duplicates from ready+in-progress
  - 039ce3c5 # feat(f00129): S3 local correlation + catalog
  - 8c4395f7 # feat(f00129): S1 — observability plugin obs_errors (Sentry/Datadog read)
---

# f00129 — observability plugin

## goal

An `observability` plugin that adds the **runtime** view mcp-vertex lacks:
recent errors, traces, and release health read from Sentry / Datadog (and
compatible APIs), correlated with the local `logs`/`metrics` the project
already keeps. Read-only, auth via env tokens (never logged), network through
the allow-listed web-fetch engine.

## why

Observability servers (Sentry, Datadog) are top-of-market. mcp-vertex has
*local* logs + metrics but no window into what happens after deploy — an agent
debugging a production issue is blind. This connects the local log/metric
correlation the project already does to the remote error stream.

## why this design

Read-only over the vendor REST APIs via the **web-fetch engine** (allow-list,
bounds, redaction) — no vendor SDK, no write scopes. Tokens come from env and
are redacted everywhere. Results normalize into the shared finding/summary
shape (r00012) and can be correlated with `logs_correlate`. Pure formatters
over injected fetch.

## non-goals

- No write/mutate scopes (no resolving issues, no muting alerts).
- No token logging; no polling daemon — request/response only.
- No bundled vendor SDK — allow-listed HTTP only.

## slices

### S1 — error + issue read

- **Status**: done
- **Files**: `plugins/observability/src/lib/errors/`, `plugins/observability/src/lib/tools/obs-errors.tool.ts`
- **Gate**: bun run validate
- implementation:
  - `lib/errors/ierror-source.ts` declares the `IErrorSource` contract
    (id, baseUrl, allowList, token, buildListUrl, parseList, optional
    `fetch` seam), the vendor-agnostic `IObsIssue` shape, the
    `authHeaderFor` map (Sentry Bearer / Datadog DD-API-KEY), the
    `redactToken` defensive pass, and a `dispatchFetch` shim that the
    test seam uses.
  - `lib/errors/list-errors.ts` is the pure planner:
    `listRecentErrors(source, input)` returns `{ source, issues,
    nextCursor, redactions }`. Ships `sentryBuildListUrl` (clamped
    limit, cursor passthrough, `is:unresolved` + `sort=lastSeen`)
    and `sentryParseList` (Sentry `data` envelope → `IObsIssue[]`).
    Fetches through the allow-listed `webFetch` engine in
    production; in tests the source's injected `fetch` is used
    directly. Token is redacted from the body before parsing
    (defence in depth on top of `redactSecrets`).
  - `lib/tools/obs-errors.tool.ts` registers `obs_errors` with
    `tags: ['observability', 'network', 'effects']`. Strict zod
    input (`project?`, `level?`, `cursor?`, `limit: 1..100`).
    Returns a structured `toolError` envelope (with an
    install-hint `nextAction`) when the source is absent OR the
    token is empty — never a crash, never logs the token.
  - `src/index.ts` resolves the source from
    `SENTRY_AUTH_TOKEN` / `DATADOG_API_KEY` env (allow-list
    pre-populated for `*.sentry.io` / `*.ingest.sentry.io` /
    `api.datadoghq.{com,eu}`) OR from a host-injected option.
  - 18 tests (12 list-errors + 6 tool): normalizeLevel, Sentry URL
    builder (limit, cursor, clamping), Sentry parser (3 cases),
    listRecentErrors (no-token empty, normalization, project
    filter, level filter, token-redaction in body), tool
    registration, happy path, install-hint on missing source,
    install-hint on empty token, project filter via the tool,
    limit-clamp.

`obs_errors` lists recent issues/events (Sentry/Datadog) via web-fetch; token
from env, redacted. Pure over injected fetch.

### S2 — traces + release health

- **Status**: done
- **Files**: `plugins/observability/src/lib/traces/index.ts`,
  `plugins/observability/src/lib/traces/interfaces.ts`,
  `plugins/observability/src/lib/traces/real-deps.ts`,
  `plugins/observability/src/lib/traces/release-health.ts`,
  `plugins/observability/src/lib/traces/trace-summarizer.ts`,
  `plugins/observability/src/lib/tools/obs-health.tool.ts`.
- implementation:
  - `traces/trace-summarizer.ts` — pure `groupRecordsByTrace(records)`
    returns `ITraceSummary[]` keyed by `(service, trace_id, hourBucket)`
    with error-rate and top-error rollup.
  - `traces/release-health.ts` — pure `computeReleaseHealth(records)`
    returns `IReleaseHealthSummary` with per-version `crashFreeRate`
    and severity bands (critical <99%, high <99.5%, medium <99.9%,
    low <99.95%).
  - `traces/real-deps.ts` — `realReadTracesDeps(workspaceRootAbs)`
    streams `.cache/mcp-vertex/results/logs/*.jsonl` +
    `logs-errors/*.jsonl`; never throws on missing dir.
  - `traces/interfaces.ts` — `IReadonlyTraceRecord`, `ITraceSummary`,
    `IReleaseHealthSummary`, `IReadTracesDeps`,
    `IReadReleaseHealthDeps`.
  - `tools/obs-health.tool.ts` — registers `obs_trace` and
    `obs_release_health`. `toolJson` / `toolError` / `summarizeFindings`
    from `@mcp-vertex/core/public`. Injected deps for tests.
  - 3 spec files: `trace-summarizer.spec.ts`,
    `release-health.spec.ts`, `obs-health.tool.spec.ts` covering
    empty input, multi-group traces, multi-version crash bands, and
    missing-data fallback.
  - Wired into `plugins/observability/src/index.ts` tool array via
    `buildObsHealthRegistration({ namespacePrefix, workspaceRootAbs })`.
- **Tests**: 5 files / 29 specs in `plugins/observability`.

### S3 — local correlation + catalog

- **Status**: done
- **Files**: `plugins/observability/src/lib/correlate/`, `plugins/observability/README.md`
- **Gate**: bun run validate
- implementation:
  - `correlate/correlate-errors.ts` adds pure `correlateErrorsWithLocal({ issues, localLogs, localMetrics, now, sinceMinutes? })` and returns one flattened match per issue x log-line pair.
  - `correlate/real-deps.ts` reads local JSONL logs from `.cache/mcp-vertex/results/logs/` + `logs-errors/` and exposes an injected `IReadLocalCorrelateDeps` seam; metrics are optional and read from `.cache/mcp-vertex/results/metrics/` when present.
  - `tools/obs-correlate.tool.ts` registers `obs_correlate` with injected remote-issue and local-log readers so tests remain hermetic; output includes `{ matches, totalIssues, totalLogs, summary }`.
  - `src/index.ts` wires the new tool with the env-backed `obs_errors` source, adds the `observability-correlate-usage` knowledge entry, and keeps the runtime reader local to the plugin.
  - `plugins/observability/README.md` now documents the S3 flow and sample output.
  - Added 2 S3 spec files covering direct correlation behavior and the tool round-trip.

Correlate remote errors with local `logs`/`metrics` (reuse `logs_correlate`);
catalog + wiki + pack membership.

## acceptance

- `bun run validate` → exit 0 (incl. `verify:tools`).
- With a token set, `obs_errors` returns recent issues; without one, an
  actionable hint (never a crash); tokens never logged.
- Remote errors correlate with a local log window on a fixture.

## notes

Reuses the web-fetch engine (allow-list/bounds/redaction), r00012 finding
shape, and `logs_correlate`. Prior art: Sentry MCP, Datadog MCP.
