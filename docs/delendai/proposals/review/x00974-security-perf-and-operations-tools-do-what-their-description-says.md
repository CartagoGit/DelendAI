---
id: x00974
title: "Security, perf and operations tools do what their description says"
kind: fix
status: review
type: proposal
track: a00095-consistency
date: 2026-10-24
last-transition-id: 5657716c-67f2-480f-ac76-08174db059af
last-correlation-id: 5657716c-67f2-480f-ac76-08174db059af
last-transition-from: in-progress
last-transition-at: 2026-11-01T06:28:36.348Z
---

# x00974 — Security, perf and operations tools do what their description says

## goal

security_audit runs every scanner it names, security_deps states its real network use, perf_bench and perf_profile run what they offer, logs_incidents and logs_tail cover the window they claim, cache honours the global cap, database keeps the schema dimension, github workflow_run pages its jobs, triage_list can tell issues apart, and browser is mature only with its driver and bounds its queries.

## why

Joint audit a00095. D63/D97: security_audit is announced as running all scanners but omits SAST. D98: security_deps attributes network only to includeOsv, the base audit uses it too. D64: perf_profile offers flamegraph but always runs the same profile. D80/D66: perf_bench only does statistics over given samples. D103/D99: logs_incidents claims "what is broken right now" but shows recurrences. D89: logs_tail silently truncates to three daily files. D57: cache.maxAgeDays does not cap the plugin rules as documented. D58: database loses the schema dimension and cannot represent homonymous tables. D86: workflow_run does not page jobs. D93: triage_list cannot tell issues apart (number only). G85: browser is stable yet cannot open a page without a driver. D43: browser_query ignores the planner that bounds results.

## non-goals

- Code-analysis scope (the scope-code proposal).

## slices

- global_gate: type

### S1 — security
- **Status**: review
- **Files**: `plugins/security/src/index.ts`, `plugins/security/src/lib/audit/sast-scan.helper.ts`, `plugins/security/src/lib/contracts/interfaces/secrets.interface.ts`, `plugins/security/src/lib/tools/security-audit.tool.ts`, `plugins/security/src/lib/tools/security-deps.tool.ts`, `plugins/security/tests/src/lib/sast-scan.helper.spec.ts`
- **Gate**: type
- acceptance:
  - "security_audit runs SAST or the description stops claiming it (D63, D97)."
  - "security_deps declares the base audit's network use (D98)."
- shipped-in: `6ce6a10a5e29`
- review-state: in_review
- review-implementer: claude-opus-5-5

### S2 — perf
- **Status**: review
- **Files**: `plugins/perf/src/lib/contracts/interfaces/perf.interface.ts`, `plugins/perf/src/lib/profile/real-perf-profile-deps.ts`, `plugins/perf/src/lib/profile/run-profile-capture.ts`, `plugins/perf/src/lib/tools/perf-bench.tool.ts`, `plugins/perf/src/lib/tools/perf-profile.tool.ts`, `plugins/perf/tests/src/lib/profile/real-perf-profile-deps.spec.ts`, `plugins/perf/tests/src/lib/profile/run-profile-capture.spec.ts`
- **Gate**: type
- acceptance:
  - "flamegraph produces a flamegraph artefact (D64)."
  - "perf_bench says it summarizes timings the caller measured and runs nothing itself (D80, D66)."
- shipped-in: `6ce6a10a5e29`
- review-state: in_review
- review-implementer: claude-opus-5-5

### S3 — logs, cache and database
- **Status**: review
- **Files**: `packages/core/src/lib/cache/eviction-registry.ts`, `packages/core/src/lib/cli/assemble.ts`, `packages/core/src/lib/plugins/load-config-file.ts`, `packages/core/tests/src/lib/cache/eviction-registry.spec.ts`, `plugins/cache/README.md`, `plugins/database/src/lib/contracts/interfaces/sqlite-binding.interface.ts`, `plugins/database/src/lib/contracts/interfaces/table-ref.interface.ts`, `plugins/database/src/lib/erd/render-erd-schemas.spec.ts`, `plugins/database/src/lib/erd/render-erd.ts`, `plugins/database/src/lib/introspect/fake-driver.ts`, `plugins/database/src/lib/introspect/introspect-engine.ts`, `plugins/database/src/lib/introspect/sqlite-driver-schemas.spec.ts`, `plugins/database/src/lib/introspect/sqlite-driver.ts`, `plugins/logs/src/generated/tool-outputs.ts`, `plugins/logs/src/lib/contracts/interfaces/log-store.interface.ts`, `plugins/logs/src/lib/services/log-search-incidents.ts`, `plugins/logs/src/lib/services/log-store.ts`, `plugins/logs/src/lib/services/log-tail-page.helper.ts`, `plugins/logs/src/lib/tools/tools.ts`, `plugins/logs/tests/src/lib/services/tail-and-incident-window.spec.ts`
- **Gate**: type
- acceptance:
  - "logs_incidents reports a time window and current errors (D103, D99); logs_tail says how many files it read (D89)."
  - "cache.maxAgeDays caps every olderThanDays rule (D57)."
  - "Tables carry their schema; two homonymous tables stay distinct (D58)."
- shipped-in: `6ce6a10a5e29`
- review-state: in_review
- review-implementer: claude-opus-5-5

### S4 — github, triage and browser
- **Status**: review
- **Files**: `packages/core/src/generated/tool-outputs.ts`, `plugins/browser/plugin.manifest.ts`, `plugins/browser/src/lib/tools/browser-inspect.tool.spec.ts`, `plugins/browser/src/lib/tools/browser-inspect.tool.ts`, `plugins/github/src/lib/contracts/constants/github-paging.constant.ts`, `plugins/github/src/lib/contracts/interfaces/paged-request.interface.ts`, `plugins/github/src/lib/tools/catalog.ts`, `plugins/github/src/lib/tools/workflow-run-jobs.helper.ts`, `plugins/github/tests/src/lib/workflow-run-jobs.helper.spec.ts`, `plugins/issues-triage/src/lib/contracts/interfaces/github.interface.ts`, `plugins/issues-triage/src/lib/github.service.ts`, `plugins/issues-triage/src/lib/tools/triage.tools.ts`, `plugins/issues-triage/tests/triage-tools.spec.ts`
- **Gate**: type
- acceptance:
  - "workflow_run pages all jobs (D86)."
  - "triage_list returns title, labels and state (D93)."
  - "browser is experimental until its driver is detected, and says so (G85); browser_query uses the planner bounds (D43)."
- shipped-in: `6ce6a10a5e29`
- review-state: in_review
- review-implementer: claude-opus-5-5

## acceptance

- security_audit runs SAST or the description stops claiming it (D63, D97).
- security_deps declares the base audit's network use (D98).
- flamegraph produces a flamegraph artefact (D64).
- perf_bench says it summarizes timings the caller measured and runs nothing itself (D80, D66).
- logs_incidents reports a time window and current errors (D103, D99); logs_tail says how many files it read (D89).
- cache.maxAgeDays caps every olderThanDays rule (D57).
- Tables carry their schema; two homonymous tables stay distinct (D58).
- workflow_run pages all jobs (D86).
- triage_list returns title, labels and state (D93).
- browser is experimental until its driver is detected, and says so (G85); browser_query uses the planner bounds (D43).

## notes
- 2026-10-27, S1: `security_audit` folds a SAST pass into its backlog through the runner `security_sast` uses, and reports it skipped, with the install hint, when no runner can work. `security_deps` says the audit itself uses the network.
- S2: `perf_profile` runs Node's own profiler for both formats (0x and clinic were probed but never run). `flamegraph` also saves the recorded `.cpuprofile` and returns its path. `perf_bench` cannot safely run commands without the command-policy trust boundary, so it is not given that power: its summary and description say it summarizes timings the caller measured and runs nothing (acceptance amended to match).
- S3: `logs_tail` reads back one day-file at a time until its page is full and returns `filesRead`/`filesTotal`. `logs_incidents` counts, without `since`, the day up to the newest failure and returns that `window` with `newestFailureAgeMs`, plus `belowMinCount`. `config.cache.maxAgeDays` caps every owner's age rule in the shared registry, only when set (a default cap would cut a configured evidence retention short). Tables carry their schema: the SQLite driver lists every attached database, foreign keys keep their target schema, and the ERD gives homonyms schema-qualified entities.
- S4: `workflow_run` pages its jobs, 100 a page up to ten pages, and says `jobsComplete`. `triage_list` already returned title and labels; it now also returns `state`. `browser_query` goes through the planner (`maxResults`, `truncated`). The browser plugin ships no Playwright driver, only its probe, so its maturity is `experimental`.
