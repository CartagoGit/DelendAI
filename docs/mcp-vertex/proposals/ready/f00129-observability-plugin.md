---
id: f00129
kind: feat
title: observability plugin — remote errors, traces and release health from Sentry/Datadog (read) to complement local logs/metrics
status: ready
date: 2026-07-23
track: plugin+observability+runtime
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

- **Status**: pending
- **Files**: `plugins/observability/src/lib/traces/`, `plugins/observability/src/lib/tools/obs-health.tool.ts`
- **Gate**: bun run validate

`obs_trace` and `obs_release_health` (crash-free rate, adoption). Normalized
summaries.

### S3 — local correlation + catalog

- **Status**: pending
- **Files**: `plugins/observability/src/lib/correlate/`, `plugins/observability/README.md`
- **Gate**: bun run validate

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
