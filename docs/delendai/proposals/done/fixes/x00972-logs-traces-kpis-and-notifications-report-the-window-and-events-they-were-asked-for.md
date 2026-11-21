---
id: x00972
title: "Logs, traces, KPIs and notifications report the window and events they were asked for"
kind: fix
status: done
type: proposal
track: a00095-consistency
date: 2026-10-24
last-transition-id: ad9a1503-893f-418e-a42d-0cc63720a2c0
last-correlation-id: ad9a1503-893f-418e-a42d-0cc63720a2c0
last-transition-from: review
last-transition-at: 2026-10-28T08:29:36.344Z
shipped-in:
  - "3f424423eb4c"
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
- **Status**: done
- **Files**: `plugins/observability/src/lib/traces/real-deps.spec.ts`, `plugins/observability/src/lib/traces/real-deps.ts`, `plugins/project-health/src/generated/tool-outputs.ts`, `plugins/project-health/src/lib/contracts/constants/project-health.constant.ts`, `plugins/project-health/src/lib/contracts/interfaces/project-health.interface.ts`, `plugins/project-health/src/lib/services/project-health-signals.service.ts`, `plugins/project-health/src/lib/services/project-health.service.ts`, `plugins/project-health/src/lib/tools/project-health.tool.ts`, `plugins/project-health/tests/src/lib/services/project-health-signals.service.spec.ts`, `plugins/project-health/tests/src/lib/services/project-health.service.spec.ts`, `plugins/project-kpis/src/lib/contracts/kpi-snapshot.interface.ts`, `plugins/project-kpis/src/lib/services/kpi-aggregation.service.ts`, `plugins/project-kpis/src/lib/tools/project-kpis.tool.ts`, `plugins/project-kpis/tests/src/project-kpis-interval.spec.ts`
- **Gate**: type
- acceptance:
  - "The newest records are kept (D51)."
  - "History and snapshot use the same from/to (D84, D76)."
  - "A score of 100 needs measured signals; missing signals lower confidence instead (D61)."
- shipped-in: `3f424423eb4c`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3.1-flash-preview
- review-log: approved by minimax-m3.1-flash-preview — verified at 3f424423eb4c, validate exit 0 and tests 22/22 claimed, no recorded run cited; acceptance 3/3: (1) observability/src/lib/traces/real-deps.ts:96-113 sorts by ts and keeps the last limit of that order, and both listTraceRecords (:250) and listReleaseHealthReco… (2) project-kpis.tool.ts:1133-1139 reads the history with query.from and query.to, and the snapshot is now built with snapshotIntervalOf(currentQuery) (:1092-1099)… (3) project-health-signals.service.ts:172-195 caps an inferred score at PROJECT_HEALTH_INFERRED_CEILING = 90 (project-health.constant.ts:61-68) and lowers the conf… — Type gate ran once for the pack in the unit worktree: bun run typecheck exited 0. Slice specs: observability 1 file / 16 tests, project-health 2 files / 5 tests, project-kpis 1 file / 1 test, all exit 0.

### S2 — Notifications and status
- **Status**: done
- **Files**: `packages/core/src/generated/tool-outputs.ts`, `plugins/completion/src/lib/safe-logging.helper.ts`, `plugins/completion/src/lib/tools/completion-tools.ts`, `plugins/completion/tests/src/lib/completion-tools.spec.ts`, `plugins/env/src/lib/env/check-env.ts`, `plugins/env/src/lib/validate/check-schema.ts`, `plugins/env/tests/src/lib/check-env.spec.ts`, `plugins/env/tests/src/lib/validate/check-schema.spec.ts`, `plugins/error-reporting/src/index.ts`, `plugins/error-reporting/src/lib/contracts/constants/funnel-stages.constant.ts`, `plugins/error-reporting/src/lib/contracts/interfaces/funnel-counters.interface.ts`, `plugins/error-reporting/src/lib/contracts/interfaces/report-store.interface.ts`, `plugins/error-reporting/src/lib/funnel-counter-store.service.ts`, `plugins/error-reporting/src/lib/report-store.service.ts`, `plugins/error-reporting/src/lib/tools/report-status.tool.ts`, `plugins/error-reporting/tests/report-store.spec.ts`, `plugins/external-mcps/src/lib/subprocess/server-registry.ts`, `plugins/external-mcps/src/lib/tools/status.tool.ts`, `plugins/external-mcps/tests/src/lib/server-registry.spec.ts`, `plugins/status-marker/README.md`, `plugins/status-marker/skills/status-marker-and-closure/SKILL.md`, `plugins/status-marker/src/lib/markers.ts`, `plugins/status-marker/src/lib/tools/close-tools.ts`, `plugins/status-marker/tests/markers.spec.ts`
- **Gate**: type
- acceptance:
  - "report_complete returns notified:true|false (D74)."
  - "Deduplicated and failed dispatches are counted apart (D114)."
  - "status reports session state separately from process state (D101)."
  - "An empty required value is missing-required (D113)."
  - "A reason too long for the line is wrapped or refused, never cut (D122)."
- shipped-in: `3f424423eb4c`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3.1-flash-preview
- review-log: approved by minimax-m3.1-flash-preview — verified at 3f424423eb4c, validate exit 0 and tests 126/126 claimed, no recorded run cited; acceptance 5/5: (1) completion-tools.ts:83-92 declares notified as a boolean in the output schema and :110-121 returns it from safeSendLoggingMessage, which is false when the host… (2) error-reporting/src/index.ts:153-161 maps a held claim to the deduplicated stage and anything not claimed to the dispatchUnclaimed stage, and report-store.serv… (3) server-registry.ts:329-332 adds a session state (not-started, opening, open, failed, closed) beside running, computed by sessionOf() (:397-407), emitted per ro… (4) check-env.ts:57-61 tracks the last assignment per key and :92-103 emits the rule id missing-required when that last assignment is empty, and check-schema.ts:15… (5) markers.ts:105-120 adds CloseMarkerTooLongError and fittedLine(), which throws instead of the old slice-and-ellipsis, and both formatCloseMarker (:154-157) and… — Type gate ran once for the pack in the unit worktree: bun run typecheck exited 0. Slice specs: completion 1 file / 5 tests, env 2 files / 25 tests, error-reporting 1 file / 9 tests, external-mcps 1 file / 40 tests, status-marker 1 file / 47 tests, all exit 0.

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
- `plugins/observability/src/lib/traces/interfaces.ts` needed no change: the records already carry `ts`.
