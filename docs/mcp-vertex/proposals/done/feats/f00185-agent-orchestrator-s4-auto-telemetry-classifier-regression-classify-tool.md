---
id: f00185
title: "agent-orchestrator S4 — auto telemetry + classifier regression + _classify tool"
kind: feat
status: done
type: proposal
track: agent-orchestrator
date: 2026-08-26
date_iso: 2026-08-26
mode: general
parent-plan: q00007
author: mcp-vertex-orchestrator (MiniMax M3, agent mode)
---
# f00185 — `agent-orchestrator` S4

## Goal

Surface the classifier as a first-class tool and lock its verdicts
against a 30-task regression fixture set so any future tweak to the
heuristic fails CI visibly.

## Acceptance

- `<ns>_classify` tool exposes the verdict (mode, reason,
  confidence) for any task; no plan, no dispatch.
- `<ns>_events` tool reads back the in-memory ring buffer of
  `plan / classify / dispatch.start / dispatch.end / rotate` events.
- 30-task regression fixture set covers trivial / small / medium /
  large hints, swarm tags, refactor tags, audit/migrate
  keywords, and free-form descriptions. Each verdict is pinned.
- The classifier adds an explicit `"medium"` hint branch
  (`medium → linear`); previously the medium hint fell through to
  description-size scoring, which the regression test caught.
- 94 tests passing across the plugin.

## Files added

```
src/lib/telemetry/event.ts                # ITelemetrySink + helpers
src/lib/tools/telemetry.tool.ts           # _classify + _events
tests/src/lib/classifier/regression.spec.ts  # 30 fixtures
```

## Notes

The default `TelemetrySink` is in-memory and process-local. Hosts
that need persistent telemetry can inject their own sink via the
plugin options in a follow-up (the S4 seam is the `ITelemetrySink`
interface).
