---
id: r00012
kind: refactor
title: shared external-tool / scanner core — one runner, one probe, one finding shape (DRY seam for security/deps/perf/forge/browser)
status: done
date: 2026-07-23
track: refactor+core+plugins
closed-by: cartago (consolidated evidence pass 2026-07-26)
closed-evidence:
  - 8 commits referencing r00012 recovered from git log --grep (precedes convention)
  - all declared Files verified to exist via 8-commit batch
shipped-in:
  - 586a545b # feat(f00141): S1 plugin registry index + resolver
  - fdc99f83 # feat(f00139): S2 self-audit rank + tool (audit plugin)
  - 123659cc # feat(env): add schema validation to env_check (f00135 S1)
  - 4ea6e8f7 # feat(f00133 S2): container_lint + container_logs
  - 67df8ef8 # feat(f00133 S1): container plugin — read-only inspect
  - e65c55e0 # feat(a00072): S3 — auto_work dogfood advisory + quality_run_quality + close_slic
  - 8c4395f7 # feat(f00129): S1 — observability plugin obs_errors (Sentry/Datadog read)
  - 9bc1a8c2 # feat(link-check): new link-check plugin — offline markdown link + anchor integri
---

# r00012 — shared external-tool / scanner core

## goal

Extract a **single reusable core** that every tool-wrapping plugin
(security, deps-audit, perf, forge, browser, database) composes instead of
each re-implementing the same four concerns. The core provides: (1) a safe
external-process runner over the existing `run-command`/command-policy seam
(timeout, bounded output, redaction, injected exec for testing); (2) a
tool-**presence + version probe with a one-command install hint**,
generalising the pattern already written twice (`auto-agent-selector`
known-providers + `orchestrator-runner` `bootstrap.discoverProviders`); (3)
an allow-listed network path (reuse the `web-fetch` engine); and (4) a
**normalised `IFinding` / `IScanResult`** shape (severity, location, rule,
message, fix) with one renderer for CLI + the VS Code extension + `toolJson`.
Build this **before** the scanner plugins so they stay thin and uniform.

## why

Without this seam, security/deps/perf/forge each grow their own subprocess
spawn, output parser, presence check and install-hint — duplication that
drifts and violates DRY/SOLID (the user explicitly asked to "reprogramar o
refactorizar para reutilizar y evitar repetir" *before* adding six similar
plugins). Two copies of the discovery/install-hint logic already exist; a
third, fourth and fifth are on the roadmap. Centralising it once means every
downstream plugin is a thin adapter (parse this tool's output → `IFinding[]`),
findings render identically everywhere, and the security review surface is one
audited runner instead of six.

## why this design

A **core library** (in `packages/core/src/lib/external-tool/`) exposed through
`@mcp-vertex/core/public`, plus a tiny optional plugin surface (`scan_run`)
for generic use. Pure functions over injected seams: `runExternalTool` takes
an injected `exec`, so planners/parsers are unit-tested without spawning. The
`IExternalTool` descriptor (id, probe command, version regex, install hints
per OS/manager) is data, mirroring `auto-agent-selector`'s known-providers
constant — so adding a tool is a data edit, not new control flow. `IFinding`
lives in `contracts/interfaces` to satisfy `types-in-contracts`.

## non-goals

- Not a new user-facing plugin category on its own — it is a core lib + one
  generic `scan_run` tool; the value is what security/deps/perf/forge build
  on it.
- No bundled binaries and no silent installs — a missing tool yields an
  install hint; running it needs explicit consent, like the CLI-agent flow.
- Does not change `run-command`/command-policy semantics — it composes them.
- No output beyond what a tool actually emits; no network unless the caller
  passes an allow-listed URL through the web-fetch engine.

## slices

### S1 — external-tool descriptor + presence/version probe + install hints

- **Status**: done
- **Files**: `packages/core/src/lib/external-tool/probe.ts`, `packages/core/src/lib/contracts/interfaces/external-tool.interface.ts`
- **Gate**: bun run validate

`IExternalTool { id, label, bin, versionArgs?, versionPattern?, installHints? }`
+ pure `probeTool(tool, deps): Promise<IToolProbeResult>` and
`probeTools(tools, deps): Promise<IToolProbeResult[]>`. Reports
available|missing + parsed version + first install hint. Production adapter
`realProbeDeps()` uses `bash -c 'command -v "$1"'` (3s timeout, argv-only —
no shell interpolation) plus `runArgv` for `--version`. Cross-platform
(Windows falls back to `where`). Mirrors `auto-agent-selector`'s
`commandExists` so a follow-up can re-point it here without behaviour
change. Exported from `@mcp-vertex/core/public`.

### S2 — normalised finding/result contracts + shared renderer

- **Status**: done
- **Files**: `packages/core/src/lib/contracts/interfaces/finding.interface.ts`, `packages/core/src/lib/external-tool/render-findings.ts`, `packages/core/src/lib/external-tool/aggregate-scans.ts`
- **Gate**: bun run validate

`IFinding { ruleId, severity, message, location?, fix? }` with
`IFindingLocation { file?, line?, column? }` and `IScanResult { tool, findings,
summary, ranAt }`. Severity band `'critical'|'high'|'medium'|'low'|'info'`
matching the audit plugin's finding model. Pure renderers:
`renderFindingsTable` (CLI rows), `sortFindings` / `worstSeverity` /
`summarizeFindings` (used by `aggregateScans` to roll multiple scan results
into one), plus `aggregateScans(results, deps) -> IRollup` for the
extension + `toolJson` surface. Reuses severity ranking from the audit
plugin. Exported from `@mcp-vertex/core/public`.

### S3 — runExternalTool seam (bounded, redacted, injected exec)

- **Status**: done
- **Files**: `packages/core/src/lib/external-tool/run-external-tool.ts`, `packages/core/src/public/index.ts`
- **Gate**: bun run validate

`runExternalTool({ tool, args, exec, timeoutMs, maxBytes, redact }):
Promise<IExternalToolRun>` over `runArgv` (no shell, timeout, capped
output) + secret-pattern redaction against the captured output. `exec` is
injected (defaults to `runArgv`), so callers are unit-testable without
spawning. Never throws: a non-zero exit yields `{ok:false, error}`, never a
thrown exception. Exported from `@mcp-vertex/core/public`. 27/27 tests
green (probe, render-findings, aggregate-scans, run-external-tool);
core 1038/1038; typecheck clean.

## acceptance

- `bun run validate` → exit 0 (incl. `types-in-contracts`, `verify:tools`).
- A reference consumer (a `deps_audit` prototype tool or the security plugin
  S1) produces `IFinding[]` with **zero** duplicated subprocess/parse/probe
  logic — it only maps the tool's raw output.
- `auto-agent-selector` and `orchestrator-runner` discovery are re-pointed at
  the shared probe with no behavioural change (their tests stay green).
- Findings render identically in the CLI and the extension from one renderer.

## notes

Foundation for f00121 (forge), f00122 (security), f00126 (perf), f00128
(database) and f00125 (browser). Reuses: `run-command`, command-policy,
`web-fetch` engine, the audit plugin finding model, and the known-providers /
`discoverProviders` presence pattern.
