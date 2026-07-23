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

- **Status**: pending
- **Files**: `plugins/observability/src/lib/errors/`, `plugins/observability/src/lib/tools/obs-errors.tool.ts`
- **Gate**: bun run validate

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
