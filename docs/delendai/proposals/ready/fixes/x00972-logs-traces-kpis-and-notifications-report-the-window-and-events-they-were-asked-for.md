---
id: x00972
title: "Logs, traces, KPIs and notifications report the window and events they were asked for"
kind: fix
status: ready
type: proposal
track: a00095-consistency
date: 2026-10-24
---

# x00972 — Logs, traces, KPIs and notifications report the window and events they were asked for

## goal

Trace sampling keeps the newest records, KPI history and snapshot cover the same interval, project_health scores need real signals, report_complete says whether the human was notified, error-reporting counts what it deduplicated, external-mcps status says whether the session opened, env_check treats empty required values as missing, and close markers keep their reason.

## why

Joint audit a00095. D51: observability trims real records the wrong way and hides the newest sample. D84/D76: project-kpis mixes history of the asked interval with a snapshot over another. D61: project_health gives deps=100 and quality=100 from weak signals. D74: report_complete confirms persistence but not the notification. D114: error-reporting counts claimDispatch=false as deduplicated though it also covers failures. D101: external-mcps status shows running:true before the MCP session opened. D113: a required env var that is present but empty leaves missing-required. D122: formatCloseMarker silently truncates the mandatory reason.

## non-goals

- Corrupt stores (the failures-stores proposal).

## slices

- global_gate: type

### S1 — traces, KPIs and health
- **Status**: pending
- **Files**: `plugins/observability/src/lib/traces/real-deps.spec.ts`, `plugins/observability/src/lib/traces/real-deps.ts`, `plugins/project-health/src/generated/tool-outputs.ts`, `plugins/project-health/src/lib/contracts/constants/project-health.constant.ts`, `plugins/project-health/src/lib/contracts/interfaces/project-health.interface.ts`, `plugins/project-health/src/lib/services/project-health-signals.service.ts`, `plugins/project-health/src/lib/services/project-health.service.ts`, `plugins/project-health/src/lib/tools/project-health.tool.ts`, `plugins/project-health/tests/src/lib/services/project-health-signals.service.spec.ts`, `plugins/project-health/tests/src/lib/services/project-health.service.spec.ts`, `plugins/project-kpis/src/lib/contracts/kpi-snapshot.interface.ts`, `plugins/project-kpis/src/lib/services/kpi-aggregation.service.ts`, `plugins/project-kpis/src/lib/tools/project-kpis.tool.ts`, `plugins/project-kpis/tests/src/project-kpis-interval.spec.ts`
- **Gate**: type
- acceptance:
  - "The newest records are kept (D51)."
  - "History and snapshot use the same from/to (D84, D76)."
  - "A score of 100 needs measured signals; missing signals lower confidence instead (D61)."

### S2 — Notifications and status
- **Status**: pending
- **Files**: `packages/core/src/generated/tool-outputs.ts`, `plugins/completion/src/lib/safe-logging.helper.ts`, `plugins/completion/src/lib/tools/completion-tools.ts`, `plugins/completion/tests/src/lib/completion-tools.spec.ts`, `plugins/env/src/lib/env/check-env.ts`, `plugins/env/src/lib/validate/check-schema.ts`, `plugins/env/tests/src/lib/check-env.spec.ts`, `plugins/env/tests/src/lib/validate/check-schema.spec.ts`, `plugins/error-reporting/src/index.ts`, `plugins/error-reporting/src/lib/contracts/constants/funnel-stages.constant.ts`, `plugins/error-reporting/src/lib/contracts/interfaces/funnel-counters.interface.ts`, `plugins/error-reporting/src/lib/contracts/interfaces/report-store.interface.ts`, `plugins/error-reporting/src/lib/funnel-counter-store.service.ts`, `plugins/error-reporting/src/lib/report-store.service.ts`, `plugins/error-reporting/src/lib/tools/report-status.tool.ts`, `plugins/error-reporting/tests/report-store.spec.ts`, `plugins/external-mcps/src/lib/subprocess/server-registry.ts`, `plugins/external-mcps/src/lib/tools/status.tool.ts`, `plugins/external-mcps/tests/src/lib/server-registry.spec.ts`, `plugins/status-marker/README.md`, `plugins/status-marker/skills/status-marker-and-closure/SKILL.md`, `plugins/status-marker/src/lib/markers.ts`, `plugins/status-marker/src/lib/tools/close-tools.ts`, `plugins/status-marker/tests/markers.spec.ts`
- **Gate**: type
- acceptance:
  - "report_complete returns notified:true|false (D74)."
  - "Deduplicated and failed dispatches are counted apart (D114)."
  - "status reports session state separately from process state (D101)."
  - "An empty required value is missing-required (D113)."
  - "A reason too long for the line is wrapped or refused, never cut (D122)."

## acceptance

- The newest records are kept (D51).
- History and snapshot use the same from/to (D84, D76).
- A score of 100 needs measured signals; missing signals lower confidence instead (D61).
- report_complete returns notified:true|false (D74).
- Deduplicated and failed dispatches are counted apart (D114).
- status reports session state separately from process state (D101).
- An empty required value is missing-required (D113).
- A reason too long for the line is wrapped or refused, never cut (D122).

## notes

- D51: the day files are read newest first; records are now ordered by time before the newest `limit` are kept.
- D84/D76: the snapshot ends at the query's `to` and counts usage over exactly `from..to` (`usageSpanDays`); its reported `windowDays` stays the whole days the output schema requires.
- D61: every summary axis is a heuristic, so each is capped at `PROJECT_HEALTH_INFERRED_CEILING` (90) and names the domain tool that would measure it; `confidence` is `low` when a presence signal (lockfile, quality scopes, lint or test config) is missing, `medium` otherwise, never `high`.
- D114: `claimDispatch` returns `claimed`, `held` (counted `deduplicated`) or `unreadable` (counted in the new `dispatchUnclaimed` stage); a counters file without the new stage reads it as 0.
- D101: each status row carries `session` (`not-started`, `opening`, `open`, `failed`, `closed`) beside `running`.
- D122: the reason is refused (`CloseMarkerTooLongError`), not wrapped: a close marker is one line by convention.
- `plugins/observability/src/lib/traces/interfaces.ts` and `plugins/project-health/src/lib/services/project-health.service.ts` needed no interface change beyond what the lists show.
