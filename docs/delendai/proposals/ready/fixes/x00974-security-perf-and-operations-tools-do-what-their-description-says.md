---
id: x00974
title: "Security, perf and operations tools do what their description says"
kind: fix
status: ready
type: proposal
track: a00095-consistency
date: 2026-10-24
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
- **Status**: pending
- **Files**: `plugins/security/src/index.ts`, `plugins/security/src/lib/tools/security-audit.tool.ts`, `plugins/security/src/lib/tools/security-deps.tool.ts`, `plugins/security/src/lib/deps/audit.ts`
- **Gate**: type
- acceptance:
  - "security_audit runs SAST or the description stops claiming it (D63, D97)."
  - "security_deps declares the base audit's network use (D98)."

### S2 — perf
- **Status**: pending
- **Files**: `plugins/perf/src/lib/profile/real-perf-profile-deps.ts`, `plugins/perf/src/lib/tools/perf-profile.tool.ts`, `plugins/perf/src/lib/bench/bench-runner.ts`, `plugins/perf/src/lib/tools/perf-bench.tool.ts`
- **Gate**: type
- acceptance:
  - "flamegraph produces a flamegraph artefact (D64)."
  - "perf_bench runs named commands and times them, or is renamed to what it does (D80, D66)."

### S3 — logs, cache and database
- **Status**: pending
- **Files**: `plugins/logs/src/lib/services/log-search-incidents.ts`, `plugins/logs/src/lib/services/log-store.ts`, `plugins/logs/src/lib/tools/tools.ts`, `plugins/cache/src/index.ts`, `plugins/cache/README.md`, `packages/core/src/lib/plugins/load-config-file.ts`, `plugins/database/src/lib/introspect/introspect-engine.ts`, `plugins/database/src/lib/erd/render-erd.ts`
- **Gate**: type
- acceptance:
  - "logs_incidents reports a time window and current errors (D103, D99); logs_tail says how many files it read (D89)."
  - "cache.maxAgeDays caps every olderThanDays rule (D57)."
  - "Tables carry their schema; two homonymous tables stay distinct (D58)."

### S4 — github, triage and browser
- **Status**: pending
- **Files**: `plugins/github/src/lib/tools/catalog.ts`, `plugins/issues-triage/src/lib/github.service.ts`, `plugins/issues-triage/src/index.ts`, `plugins/issues-triage/tests/triage-tools.spec.ts`, `plugins/browser/plugin.manifest.ts`, `plugins/browser/src/index.ts`, `plugins/browser/src/lib/page/planner.ts`, `plugins/browser/src/lib/tools/browser-inspect.tool.ts`
- **Gate**: type
- acceptance:
  - "workflow_run pages all jobs (D86)."
  - "triage_list returns title, labels and state (D93)."
  - "browser is experimental until its driver is detected, and says so (G85); browser_query uses the planner bounds (D43)."

## acceptance

- security_audit runs SAST or the description stops claiming it (D63, D97).
- security_deps declares the base audit's network use (D98).
- flamegraph produces a flamegraph artefact (D64).
- perf_bench runs named commands and times them, or is renamed to what it does (D80, D66).
- logs_incidents reports a time window and current errors (D103, D99); logs_tail says how many files it read (D89).
- cache.maxAgeDays caps every olderThanDays rule (D57).
- Tables carry their schema; two homonymous tables stay distinct (D58).
- workflow_run pages all jobs (D86).
- triage_list returns title, labels and state (D93).
- browser is experimental until its driver is detected, and says so (G85); browser_query uses the planner bounds (D43).
