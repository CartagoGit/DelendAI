---
id: x00978
title: "The VS Code extension works per folder and keeps edits, choices and polling consistent"
kind: fix
status: ready
type: proposal
track: a00095-consistency
date: 2026-10-24
---

# x00978 — The VS Code extension works per folder and keeps edits, choices and polling consistent

## goal

Commands act on the workspace folder they were invoked from, run-validation keeps the command's cwd, saves and discards never lose newer edits, a cancelled dialog changes nothing, routing uses the current tool name, the dashboard submits current preferences and its first realtime click starts, and a disposed view stops polling.

## why

Joint audit a00095 and gpt-6.1-sol. D24: the extension is biased to workspaceFolders[0]. D25: run validation re-runs the failed command in a private terminal without cwd. UI-01: the dashboard serialises functions with missing dependencies. UI-CFG01: a save acknowledgement clears edits made after the request. UI-CFG02: discard restores the opening snapshot after a successful save. UI-ACTION01: cancelling the provider reason dialog still changes the provider state. UI-ROUTE01: VS Code routes non-direct calls through the retired vertex tool name. UI-PREF01: theme and language controls submit stale preferences. UI-LOG01: the first Start realtime click sends stop. UI-LOG02: disposing a dashboard view leaves its log polling running.

## non-goals

- Escaping and CSP (the escaping proposal).

## slices

- global_gate: type

### S1 — Folder and cwd
- **Status**: pending
- **Files**: `extensions/vscode/src/commands/open-plugin-config.ts`, `extensions/vscode/src/commands/run-validation.ts`, `extensions/vscode/src/test/commands.spec.ts`
- **Gate**: type
- acceptance:
  - "Commands resolve the folder of the active editor or the picked folder (D24)."
  - "The re-run passes the dry-run command's cwd (D25)."

### S2 — Edits and choices
- **Status**: pending
- **Files**: `extensions/vscode/src/commands/open-configuration-center.ts`, `packages/ui-extension/src/configuration-center/configuration-center-script.ts`, `extensions/vscode/src/commands/provider-actions.ts`
- **Gate**: type
- acceptance:
  - "An acknowledgement clears only the edits it saved (UI-CFG01); discard restores the last saved state (UI-CFG02); cancel changes nothing (UI-ACTION01)."

### S3 — Routing, dashboard and polling
- **Status**: pending
- **Files**: `extensions/vscode/src/extension.ts`, `extensions/vscode/src/providers/dashboard-webview-view-provider.ts`, `packages/ui-extension/src/dashboard/render-dashboard.ts`, `packages/client/src/lib/services/logs.service.ts`
- **Gate**: type
- acceptance:
  - "Calls route through delendai_compact_router (UI-ROUTE01)."
  - "The dashboard script is self-contained (UI-01); controls submit current values (UI-PREF01); the first click starts (UI-LOG01); dispose stops polling (UI-LOG02)."

## acceptance

- Commands resolve the folder of the active editor or the picked folder (D24).
- The re-run passes the dry-run command's cwd (D25).
- An acknowledgement clears only the edits it saved (UI-CFG01); discard restores the last saved state (UI-CFG02); cancel changes nothing (UI-ACTION01).
- Calls route through delendai_compact_router (UI-ROUTE01).
- The dashboard script is self-contained (UI-01); controls submit current values (UI-PREF01); the first click starts (UI-LOG01); dispose stops polling (UI-LOG02).
