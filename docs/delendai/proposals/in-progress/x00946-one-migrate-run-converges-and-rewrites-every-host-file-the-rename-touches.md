---
id: x00946
title: "One migrate run converges and rewrites every host file the rename touches"
kind: fix
status: in-progress
type: proposal
track: a00095-consistency
date: 2026-10-23
last-transition-id: 85521401-9401-45fb-a483-3b51bce53c3b
last-correlation-id: 85521401-9401-45fb-a483-3b51bce53c3b
last-transition-from: ready
last-transition-at: 2026-10-24T07:52:07.921Z
---

# x00946 — One migrate run converges and rewrites every host file the rename touches

## goal

A single `delendai migrate run` on a project that used the old name leaves nothing for a second run: every host config (Codex, Cursor, Continue, VS Code, Claude) is rewritten, agent files are renamed as well as edited, and the live rebrand residue is gone while the published history keeps its old name.

## why

Joint audit a00095. G127: migrate does not rewrite .codex/config.toml, .cursor/mcp.json or .continue/config.json. G128: one migrate run does not converge; the delendai.config.json it leaves still carries what a second run changes. G129: the migration rewrites a Claude agent's content but not its file name (.claude/agents/mcp-vertex-orchestrator.md with `name: delendai-orchestrator`). G5: incomplete rebrand: live mcp-vertex mentions remain (the CHANGELOG entries of versions published under that name stay, per the discrepancy recorded in the audit).

## non-goals

- Atomicity and rollback of the transaction (x00945).
- Rewriting the CHANGELOG history published as mcp-vertex.

## slices

- global_gate: type

### S1 — Every host config and agent file
- **Status**: pending
- **Files**: `packages/core/src/lib/workspace-migration/migrators/host-config.migrator.ts`, `packages/core/src/lib/workspace-migration/migrators/agent-files.migrator.ts`, `packages/core/src/lib/workspace-migration/migrators/identity-renames.ts`
- **Gate**: type
- acceptance:
  - "A fixture with .codex/config.toml, .cursor/mcp.json and .continue/config.json naming the old server comes out naming delendai in each (G127)."
  - "An agent file whose name carries the old prefix is renamed to match its `name:` header, with the rename journalled (G129)."

### S2 — One run is enough
- **Status**: pending
- **Files**: `packages/core/src/lib/workspace-migration/migrators/config-file.migrator.ts`, `packages/core/src/lib/workspace-migration/migrations/delendai-to-delendai-v1.ts`
- **Gate**: type
- acceptance:
  - "A spec runs migrate twice on the legacy fixture; the second run reports zero steps and changes no byte (G128)."

### S3 — Live rebrand residue
- **Status**: pending
- **Files**: `tools/scripts/lint/rebrand-propagate.script.ts`
- **Gate**: type
- acceptance:
  - "rebrand-propagate --check lists no live mcp-vertex mention outside the published CHANGELOG history and the legacy-name fixtures it exempts (G5)."

## acceptance

- A fixture with .codex/config.toml, .cursor/mcp.json and .continue/config.json naming the old server comes out naming delendai in each (G127).
- An agent file whose name carries the old prefix is renamed to match its `name:` header, with the rename journalled (G129).
- A spec runs migrate twice on the legacy fixture; the second run reports zero steps and changes no byte (G128).
- rebrand-propagate --check lists no live mcp-vertex mention outside the published CHANGELOG history and the legacy-name fixtures it exempts (G5).
