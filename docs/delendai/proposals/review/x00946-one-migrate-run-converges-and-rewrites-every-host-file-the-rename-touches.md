---
id: x00946
title: "One migrate run converges and rewrites every host file the rename touches"
kind: fix
status: review
type: proposal
track: a00095-consistency
date: 2026-10-23
last-transition-id: c6e39e0c-e3ce-4a98-ad58-00787cca6c02
last-correlation-id: c6e39e0c-e3ce-4a98-ad58-00787cca6c02
last-transition-from: in-progress
last-transition-at: 2026-10-24T08:27:34.166Z
shipped-in:
  - "60029cf6a12c6c0eb1367edca4f1133f93281c3d"
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
- **Status**: done
- **Files**: `packages/core/src/lib/workspace-migration/migrators/host-config.migrator.ts`, `packages/core/src/lib/workspace-migration/migrators/agent-files.migrator.ts`
- **Gate**: type
- acceptance:
  - "A fixture with .codex/config.toml, .cursor/mcp.json and .continue/config.json naming the old server comes out naming delendai in each (G127)."
  - "An agent file whose name carries the old prefix is renamed to match its `name:` header, with the rename journalled (G129)."
- shipped-in: `831dca73cf2b`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: claude-sonnet-5-5
- review-log: approved by claude-sonnet-5-5 — verified at 60029cf6a12c, validate exit 0 and tests 20/20 claimed, no recorded run cited; acceptance 2/2: (1) host-config.migrator.spec 'rewrites the Cursor, Continue and Codex configs that name the old server' passes (2) agent-files.migrator.spec 'renames an agent file whose name carries the old prefix, and plans t...' (journalled rename) passes — verified by code reading and spec runs

### S2 — One run is enough
- **Status**: done
- Delivered as proof: the start-up route already converges once S1's renames land; `legacy-migration-manager.spec.ts` runs it twice on every legacy surface and the second run changes no byte. The migrators themselves needed no change.
- **Files**: `packages/core/tests/src/lib/workspace-migration/legacy-migration-manager.spec.ts`
- **Gate**: type
- acceptance:
  - "A spec runs migrate twice on the legacy fixture; the second run reports zero steps and changes no byte (G128)."
- shipped-in: `2850b9b97631`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: claude-sonnet-5-5
- review-log: approved by claude-sonnet-5-5 — verified at 60029cf6a12c, validate exit 0 and tests 11/11 claimed, no recorded run cited; acceptance 1/1: (1) legacy-migration-manager.spec 'one migrate run converges (G128): zero steps, no byte changed' passes — verified by code reading and spec runs

### S3 — Live rebrand residue
- **Status**: done
- Delivered before this unit: `bun run migrate:rebrand:check` reports 0 live mentions outside the published history and the exempted fixtures on the develop commit this unit started from.
- shipped-in: `85ed73972a10`
- **Files**: `tools/scripts/migrate/rebrand-propagate.script.ts`
- **Gate**: type
- acceptance:
  - "rebrand-propagate --check lists no live mcp-vertex mention outside the published CHANGELOG history and the legacy-name fixtures it exempts (G5)."
- review-state: in_review
- review-implementer: claude-opus-5-5

## acceptance

- A fixture with .codex/config.toml, .cursor/mcp.json and .continue/config.json naming the old server comes out naming delendai in each (G127).
- An agent file whose name carries the old prefix is renamed to match its `name:` header, with the rename journalled (G129).
- A spec runs migrate twice on the legacy fixture; the second run reports zero steps and changes no byte (G128).
- rebrand-propagate --check lists no live mcp-vertex mention outside the published CHANGELOG history and the legacy-name fixtures it exempts (G5).
