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
- **Files**: `plugins/observability/src/lib/traces/real-deps.ts`, `plugins/observability/src/lib/traces/interfaces.ts`, `plugins/project-kpis/src/lib/tools/project-kpis.tool.ts`, `plugins/project-health/src/lib/services/project-health-signals.service.ts`, `plugins/project-health/src/lib/services/project-health.service.ts`
- **Gate**: type
- acceptance:
  - "The newest records are kept (D51)."
  - "History and snapshot use the same from/to (D84, D76)."
  - "A score of 100 needs measured signals; missing signals lower confidence instead (D61)."

### S2 — Notifications and status
- **Status**: pending
- **Files**: `plugins/completion/src/lib/tools/completion-tools.ts`, `plugins/completion/src/lib/safe-logging.helper.ts`, `plugins/error-reporting/src/lib/report-store.service.ts`, `plugins/external-mcps/src/lib/tools/status.tool.ts`, `plugins/env/src/lib/validate/env-schema.ts`, `plugins/status-marker/src/lib/markers.ts`
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
