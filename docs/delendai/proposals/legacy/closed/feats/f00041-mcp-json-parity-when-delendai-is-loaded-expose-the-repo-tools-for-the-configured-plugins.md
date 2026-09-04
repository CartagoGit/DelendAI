---
id: f00041
kind: feat
title: mcp.json parity — when delendai is loaded, expose the repo tools for the configured plugins
status: done
type: proposal
track: host+core+docs+workflow
date: 2026-06-21
closed-by: legacy (pre-convention; consolidated pass 2026-07-26)
closed-evidence:
  - f00041 predates the shipped-in convention (pre-2026-07-24)
  - proposal body lists the original audit/fix/test deliverables
  - status was already 'done' before this consolidation pass

archived-on: 2026-08-24
---

# f00049 — mcp.json parity — when delendai is loaded, expose the repo tools for the configured plugins

## Goal

Make the VS Code / mcp.json launch path for delendai resolve the same plugin/tool surface the repo declares in delendai.config.json (and any explicit preset/plugins flags), and make any mismatch visible immediately instead of silently booting a server whose useful plugin tools are missing from the client surface.

## why

- The repo already declares a plugin surface in `delendai.config.json`, but the `mcp.json` launch path shown in the workspace currently boots the host with only `--workspace`, leaving too much room for a silent mismatch between configured plugins and loaded tools.
- For a user or agent, “the server is loaded” must imply “the repo tools for the configured plugins are actually available”, not “the process started but you must reverse-engineer which plugin set it resolved”.
- The highest-value fix is parity plus diagnostics: same resolution rules, then a compact explanation of what loaded and why.

## non-goals

- Auto-enabling every host-only or optional plugin by default.
- Replacing the preset system or the existing `delendai.config.json` contract.
- Expanding into write-side tool coverage; that is already tracked elsewhere.

## Slices

- global_gate: type

### S1 — Canonical plugin resolution for mcp.json-launched host
- **Files**: tools/scripts/host/host-server.script.ts, packages/core/src/lib/cli/assemble.ts, delendai.config.json
- **Status**: done
- **Gate**: `bun run typecheck`
- **Acceptance**:
  - "The host launch path used by .vscode/mcp.json resolves plugins from the same canonical sources as the rest of the repo: preset delta, explicit --plugins, exclude-plugins, and delendai.config.json plugin entries."
  - "A workspace that declares plugins in delendai.config.json does not silently boot a reduced tool surface when started only via mcp.json."
  - "Host-only plugins remain opt-in; the slice fixes parity, not automatic expansion to every possible plugin."

### S2 — Compact diagnostic of loaded plugins and tools
- **Files**: packages/core/src/lib/tools/overview-tool.ts
- **Status**: done
- **Gate**: `bun run typecheck`
- **Acceptance**:
  - "On startup or first cheap inspection, the server can explain which plugins and tools were actually loaded for the workspace and whether that matches config/preset expectations."
  - "The diagnostic path is compact-first: it does not require a verbose dump just to learn that the server loaded the wrong surface."
  - "If the configured plugin surface and the loaded tool surface diverge, the reason is explicit instead of implicit."

### S3 — Repo-facing configuration and docs contract
- **Files**: .vscode/mcp.json, README.md, docs/CROSS-IDE.md, docs/README-DELENDAI.md
- **Status**: done
- **Gate**: `bun run lint:proposals`
- **Acceptance**:
  - "The repo documents one canonical way to launch delendai from mcp.json so the loaded tools match the repo's declared plugin surface."
  - "The example mcp.json and docs explain the precedence between mcp.json flags, presets and delendai.config.json."
  - "A user opening the repo can tell, without reverse-engineering the host script, why a given plugin tool should or should not be available."

### S4 — Validation coverage for loaded-tool parity
- **Files**: packages/core/tests/src/lib/e2e/token-budget.e2e.spec.ts, packages/core/tests/src/lib/e2e/mcp-json-plugin-parity.e2e.spec.ts
- **Status**: done
- **Gate**: `bun run typecheck`
- **Acceptance**:
  - "Tests cover at least one workspace where delendai.config.json declares plugins and the mcp.json launch path exposes the expected tool names."
  - "A mismatch between configured plugins and loaded tools fails in tests or yields a structured, test-covered diagnostic."
  - "bun run validate is green."

## acceptance

- The mcp.json launch path resolves the same effective plugin/tool surface the repo config declares.
- A compact diagnostic explains what was loaded and why.
- The docs and example config make that precedence understandable to a user opening the repo.
- Validation covers at least one parity case end to end.

## notes

### Closure — 2026-06-21

- `assembleCliConfig` now merges preset/CLI plugins with plugin declarations from `delendai.config.json`, then applies `exclude-plugins` to the final set.
- Compact overview now exposes `pluginDiagnostic` with requested, loaded, missing, config-declared plugins and error count.
- `.vscode/mcp.json`, README and cross-IDE docs document the repo launcher and precedence.
- Verified with `bun run typecheck`, focused parity/token-budget tests and `bun run validate`.
