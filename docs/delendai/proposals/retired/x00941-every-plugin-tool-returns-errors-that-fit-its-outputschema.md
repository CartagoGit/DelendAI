---
id: x00941
title: "Every plugin tool returns errors that fit its outputSchema"
kind: fix
status: retired
type: proposal
track: a00095-consistency
date: 2026-10-23
last-transition-id: 207c5adf-373e-498c-a43d-8a579fee0e01
last-correlation-id: 207c5adf-373e-498c-a43d-8a579fee0e01
last-transition-from: ready
last-transition-at: 2026-10-23T17:04:57.256Z
---

# x00941 — Every plugin tool returns errors that fit its outputSchema

## goal

The plugins outside core and proposals stop declaring success-only outputSchemas for tools whose handlers return toolError: each schema admits the error branch, and verify:tools reports no mismatch for any plugin.

## why

Joint audit a00095. D18: usage-tracking clear declares `ok: z.literal(true)` and returns toolError without confirm; memory_save, memory_forget and the logs tools do the same. D19: the gitlab read surface returns normalizeRequestError() from catch blocks of tools with success-only schemas, almost the whole plugin. G71: the pattern extends to api, observability and prompt-eval. G109 measured 30 plugins in the family; the forge, github and roadmap tools carry the same success-only literal.

## non-goals

- Core, proposals and external-mcps (x00940).
- The verify:tools gate itself (x00939).

## slices

- global_gate: type

### S1 — usage-tracking, memory and logs
- **Status**: pending
- **Files**: `plugins/usage-tracking/src/lib/tools/clear.tool.ts`, `plugins/memory/src/lib/tools/tools.ts`, `plugins/logs/src/lib/tools/tools.ts`
- **Gate**: type
- acceptance:
  - "usage_clear without confirm, memory_save and memory_forget on a refused input, and a logs tool on an unreadable store each return a result that validates against the declared outputSchema through a listing client (D18)."

### S2 — gitlab, github and forge
- **Status**: pending
- **Files**: `plugins/gitlab/src/lib/tools/shared.ts`, `plugins/github/src/lib/tools/catalog.ts`, `plugins/github/src/lib/tools/write-tools.ts`, `plugins/forge/src/lib/contracts/constants/forge-read.constant.ts`, `plugins/forge/src/lib/contracts/constants/forge-release.constant.ts`, `plugins/forge/src/lib/contracts/constants/forge-search.constant.ts`, `plugins/forge/src/lib/contracts/constants/forge-write.constant.ts`
- **Gate**: type
- acceptance:
  - "A gitlab read tool whose request fails returns a validated error result; one shared output-schema helper admits normalizeRequestError's shape instead of each tool redeclaring success only (D19)."
  - "github and forge tools that can fail declare the error branch; verify:tools reports no mismatch for gitlab, github or forge."

### S3 — roadmap, api, observability and prompt-eval
- **Status**: pending
- **Files**: `plugins/roadmap/src/lib/tools/delta.tool.ts`, `plugins/roadmap/src/lib/tools/plan-close.tool.ts`, `plugins/roadmap/src/lib/tools/plan-init.tool.ts`, `plugins/roadmap/src/lib/tools/promotion.tool.ts`, `plugins/roadmap/src/lib/tools/readiness.tool.ts`, `plugins/roadmap/src/lib/tools/show.tool.ts`, `plugins/roadmap/src/lib/tools/sync.tool.ts`, `plugins/api/src/lib/tools/api-mock.tool.ts`, `plugins/observability/src/lib/tools/obs-errors.tool.ts`, `plugins/prompt-eval/src/lib/tools/eval-run.tool.ts`
- **Gate**: type
- acceptance:
  - "Each listed tool's failure path validates against its outputSchema through a listing client (G71)."
  - "verify:tools (x00939 S1) prints zero mismatches across all plugins; the G109 denominator it prints is recorded in the closing evidence."

## acceptance

- usage_clear without confirm, memory_save and memory_forget on a refused input, and a logs tool on an unreadable store each return a result that validates against the declared outputSchema through a listing client (D18).
- A gitlab read tool whose request fails returns a validated error result; one shared output-schema helper admits normalizeRequestError's shape instead of each tool redeclaring success only (D19).
- github and forge tools that can fail declare the error branch; verify:tools reports no mismatch for gitlab, github or forge.
- Each listed tool's failure path validates against its outputSchema through a listing client (G71).
- verify:tools (x00939 S1) prints zero mismatches across all plugins; the G109 denominator it prints is recorded in the closing evidence.
