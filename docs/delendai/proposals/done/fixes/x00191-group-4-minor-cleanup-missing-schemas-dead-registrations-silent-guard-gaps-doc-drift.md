---
id: x00191
title: "Group 4: minor cleanup — missing schemas, dead registrations, silent guard gaps, doc drift"
kind: fix
status: done
type: proposal
track: general
date: 2026-07-29
shipped-in:
    - 4f1f1872 # S1-S6 — 7 minor findings across deps/notification/quality/forge/browser/git/issues
---

# x00191 — Group 4: minor cleanup — missing schemas, dead registrations, silent guard gaps, doc drift

## Goal

Fix seven small, independently-verified findings from the ongoing dogfooding audit: deps_polyglot and notification's notify_status had no inputSchema at all (violating repo rule 8); quality_run_all's toolError path silently emitted no incident despite a logsSink being passed in (added after run_quality's incident-logging wiring shipped, never got the same wrapper); forge's search_code tool was fully implemented and tested but never wired into the plugin's tools array (completely unreachable), and its own knowledge doc described a fictional kind-discriminator shape for both the write and release tools; browser_screenshot fell back to process.cwd() when pluginCacheDir was omitted (repo rule 2 violation); git_commit's --amend ownership guard only fired when both lastAuthor AND agent were known, so omitting agent entirely silently skipped the check instead of refusing; the issues plugin's README documented input/output shapes for 4 of its 5 tools that don't match the real zod schemas at all (wrong field names, a wrong input field, an entirely undocumented field).

## why

Continues this session's dogfooding audit (x00166-x00169, x00184, x00190). Each finding was independently verified against the real source before filing — not speculative.

## non-goals

- Auditing every other plugin's knowledge-doc/README for similar drift — the issues plugin's README was checked exhaustively because it was flagged; a repo-wide doc-accuracy sweep is separate, larger work.
- Adding incident logging to quality tools that never had it (get_quality_scopes, quality_cancel) — only quality_run_all is fixed, matching run_quality's existing precedent exactly.

## Slices

- global_gate: type

### S1 — deps_polyglot + notify_status: add missing inputSchema
- **Status**: done
- **Files**: `plugins/deps/src/lib/tools/tools.ts`, `plugins/notification/src/lib/tools/tools.ts`
- **Gate**: none
- acceptance:
  - "deps_polyglot declares inputSchema: z.object({}).strict()"
  - "notify_status declares inputSchema: z.object({}).strict()"

### S2 — quality_run_all: wire the incident-logging sink it silently dropped
- **Status**: done
- **Files**: `plugins/quality/src/lib/services/run-all.ts`, `plugins/quality/tests/src/lib/run-all.spec.ts`
- **Gate**: none
- acceptance:
  - "IRunAllToolOptions gains an optional logsSink field"
  - "The handler is wrapped in withIncidentLogging matching run_quality's existing pattern (incidentType: 'quality-failure')"
  - "New test proves an incident is recorded on the injected sink when the tool returns a toolError"

### S3 — forge: wire search_code + fix the knowledge doc's fictional kind-discriminator claims
- **Status**: done
- **Files**: `plugins/forge/src/index.ts`, `plugins/forge/tests/src/lib/plugin-options.spec.ts`
- **Gate**: none
- acceptance:
  - "buildForgeSearchToolRegistrations is imported and its output spread into the tools array"
  - "The knowledge doc body accurately lists 3 separate write tools (not one _write tool with a kind discriminator), the plain _release tool, and the newly-wired _search_code tool"
  - "The existing plugin-registration test's expected tool-id list includes search_code"

### S4 — browser_screenshot: remove the process.cwd() fallback
- **Status**: done
- **Files**: `plugins/browser/src/lib/tools/browser-inspect.tool.ts`, `plugins/browser/src/lib/tools/browser-inspect.tool.spec.ts`
- **Gate**: none
- acceptance:
  - "IBrowserInspectToolOptions.pluginCacheDir is required, not optional"
  - "resolvePluginCacheDir/screenshotPathFor no longer reference process.cwd()"
  - "Existing tests updated to always pass pluginCacheDir explicitly"

### S5 — git_commit: refuse --amend when no agent identity is supplied
- **Status**: done
- **Files**: `plugins/git/src/lib/tools/write-tools.ts`, `plugins/git/tests/src/lib/write-tools.spec.ts`
- **Gate**: none
- acceptance:
  - "amend: true with args.agent === undefined returns a toolError before even checking lastAuthor, instead of silently proceeding"
  - "New test proves this exact case is now refused"
  - "The tool description and IGitCommitArgs.agent doc comment reflect that agent is required for amend"

### S6 — issues plugin README: fix input/output shapes for 4 of 5 tools
- **Status**: done
- **Files**: `plugins/issues/README.md`
- **Gate**: none
- acceptance:
  - "issues_list's documented input drops the nonexistent assignee field and its output matches the real {ok, issues?, tier?} shape"
  - "issues_fetch's documented output matches the real nested {ok, issue?, comments?} shape instead of a flat one"
  - "issues_ingest's documented input uses the real force field (not the nonexistent reason) and its output matches {ok, filePath?, scaffold?, alreadyExisted?}"
  - "issues_analyze's documented input is the real {number} (not the nonexistent scaffoldPath) and its output matches the real {ok, draft?, sourceFile?} shape"

## acceptance

- deps_polyglot declares inputSchema: z.object({}).strict()
- notify_status declares inputSchema: z.object({}).strict()
- IRunAllToolOptions gains an optional logsSink field
- The handler is wrapped in withIncidentLogging matching run_quality's existing pattern (incidentType: 'quality-failure')
- New test proves an incident is recorded on the injected sink when the tool returns a toolError
- buildForgeSearchToolRegistrations is imported and its output spread into the tools array
- The knowledge doc body accurately lists 3 separate write tools (not one _write tool with a kind discriminator), the plain _release tool, and the newly-wired _search_code tool
- The existing plugin-registration test's expected tool-id list includes search_code
- IBrowserInspectToolOptions.pluginCacheDir is required, not optional
- resolvePluginCacheDir/screenshotPathFor no longer reference process.cwd()
- Existing tests updated to always pass pluginCacheDir explicitly
- amend: true with args.agent === undefined returns a toolError before even checking lastAuthor, instead of silently proceeding
- New test proves this exact case is now refused
- The tool description and IGitCommitArgs.agent doc comment reflect that agent is required for amend
- issues_list's documented input drops the nonexistent assignee field and its output matches the real {ok, issues?, tier?} shape
- issues_fetch's documented output matches the real nested {ok, issue?, comments?} shape instead of a flat one
- issues_ingest's documented input uses the real force field (not the nonexistent reason) and its output matches {ok, filePath?, scaffold?, alreadyExisted?}
- issues_analyze's documented input is the real {number} (not the nonexistent scaffoldPath) and its output matches the real {ok, draft?, sourceFile?} shape
