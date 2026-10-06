---
id: x00877
title: "An upgrade leaves the project as its configuration says, and nothing else"
kind: fix
status: ready
type: proposal
track: trust
date: 2026-10-06
---

# x00877 — An upgrade leaves the project as its configuration says, and nothing else

## goal

A project that used an older delendai, or mcp-vertex before it, ends an upgrade with every state migrated (proposal state in the SQLite store) and no residue: nothing of the old name, the old storage layout, or a development mode it no longer uses.

## why

The owner's requirement (2026-10-06): when a project that used delendai upgrades, its proposal state must reach the SQLite store intact, and nothing may stay of mcp-vertex, of the old storage layout, or of a development mode the project left; the project is what its `delendai.config.json` says.

A probe drove the real CLI in throwaway adopting projects the same day (an mcp-vertex era tree, one with the old proposal storage, one that changed development profile). What it found:

- `migrate status`, read-only by its name, applied the whole migration; a later `--dry-run` could preview nothing.
- The legacy proposals database at `.delendai/state/proposals.sqlite` is never migrated. `doctor` reports 100/100, and every proposals tool then fails with a manual `mv` remedy (`assertNoUnmigratedLegacyDatabase`); no migrator or repair performs the move. Moved by hand, the empty legacy directory stays. A committed registry at the old `docs/delendai/proposals/index.json` stays too, read by nothing.
- After the rename, the root `.mcp.json` still runs `@mcp-vertex/cli` (only `.vscode/mcp.json` is migrated), root `AGENTS.md`/`CLAUDE.md` keep the old name (only the agent folders are), and `.gitignore` still ignores `.cache/mcp-vertex/`. Nothing reports these leftovers: the residual scanner is surfaced by neither `migrate` nor `doctor`.
- After a profile change, a work ref and worktree of the old shape with an unmerged commit is reported by nobody (`work status` 0 live, `work doctor` all hold, `work reap` empty), and the guard hooks and `delendai.guard.*` keys stay whatever the new profile needs.
- `guard install` configures `merge.delendai-generated.driver` to `tools/scripts/git/generated-merge-driver.script.ts`, a path that exists only in this repository.
- The host-scope migrator (`~/.claude.json`, `~/.codex/config.toml`) exists and is registered nowhere.

## non-goals

- Rewriting a person's own prose inside moved documentation: a document that mentions the old name is reported, not edited.
- Touching a user-level config from a workspace command: host scope is its own explicit, opt-in step.
- Deleting work: what the old mode left that holds commits is surfaced with its remedy (publish or retire), never removed.

## slices

- global_gate: none

### S1 — migrate status only reads
- **Status**: pending
- **Files**: `packages/cli/src/commands/migrate.command.ts`
- **Gate**: type
- acceptance:
  - "`migrate status` and `migrate --dry-run` write nothing: the tree, the config and `.delendai/migrations-applied.json` are byte-identical before and after."
  - "Only `migrate run` applies a migration."

### S2 — The legacy proposal state is moved, and no copy of it stays behind
- **Status**: pending
- **Files**: `packages/core/src/lib/workspace-migration/migrators/proposals-state.migrator.ts`, `packages/core/src/lib/workspace-migration/migration-registry.ts`
- **Gate**: type
- acceptance:
  - "`migrate run` moves `.delendai/state/proposals.sqlite` and its `-wal`/`-shm` sidecars to `.cache/delendai/state/` when nothing is there yet, and removes the emptied legacy directory."
  - "When both exist it moves nothing and reports the conflict; it never overwrites."
  - "After it, the proposals tools open the database without the manual remedy."
  - "A committed `docs/<docsDir>/proposals/index.json` (the old location) is removed by `migrate run`; it is regenerable and nothing reads it."
  - "The comments that still describe it as a committed variant are corrected."

### S3 — Every host file and instruction file names delendai
- **Status**: pending
- **Files**: `packages/core/src/lib/workspace-migration/migrators/host-config.migrator.ts`, `packages/core/src/lib/workspace-migration/migrators/agent-files.migrator.ts`
- **Gate**: type
- acceptance:
  - "The root `.mcp.json` is migrated like `.vscode/mcp.json`."
  - "Root `AGENTS.md`, `CLAUDE.md` and `.github/copilot-instructions.md` are migrated like the agent folders."

### S4 — No ignore line or moved file keeps the old name
- **Status**: pending
- **Files**: `packages/core/src/lib/workspace-migration/migrators/cache-and-docs.migrator.ts`
- **Gate**: type
- acceptance:
  - "A `.gitignore` line naming a renamed directory names the new one; a duplicate is not added."
  - "`migrate status` reports any legacy spelling the scanner still finds in live files, so a leftover is never silent."

### S5 — A profile change leaves nothing of the old mode unowned
- **Status**: pending
- **Files**: `packages/core/src/lib/workspace-migration/config-transitions.service.ts`
- **Gate**: type
- acceptance:
  - "After the development profile changes, every work ref and worktree of the old shape is either still a live unit the new profile sees, or reported by `work doctor` with its remedy (publish or retire); none is invisible."
  - "Hooks and `delendai.guard.*` keys follow the profile: installed where it needs them, removed where it does not."

### S6 — The generated-files merge driver exists where it is configured
- **Status**: pending
- **Files**: `packages/cli/src/contracts/constants/generated-merge-driver.constant.ts`
- **Gate**: type
- acceptance:
  - "`guard install` in an adopting project configures a merge driver that resolves to a file present there (the shipped CLI), or none."

### S7 — The host-scope configs are migrated too
- **Status**: pending
- **Files**: `packages/core/src/lib/workspace-migration/host-scope/global-config.migrator.ts`
- **Gate**: type
- acceptance:
  - "The user-level host configs (`~/.claude.json`, `~/.codex/config.toml`) are migrated by an explicit, opt-in host-scope command, never by a workspace `migrate run`, and a dry run lists what it would change."

## acceptance

- `migrate status` and `migrate --dry-run` write nothing: the tree, the config and `.delendai/migrations-applied.json` are byte-identical before and after.
- Only `migrate run` applies a migration.
- `migrate run` moves `.delendai/state/proposals.sqlite` and its `-wal`/`-shm` sidecars to `.cache/delendai/state/` when nothing is there yet, and removes the emptied legacy directory.
- When both exist it moves nothing and reports the conflict; it never overwrites.
- After it, the proposals tools open the database without the manual remedy.
- A committed `docs/<docsDir>/proposals/index.json` (the old location) is removed by `migrate run`; it is regenerable and nothing reads it.
- The comments that still describe it as a committed variant are corrected.
- The root `.mcp.json` is migrated like `.vscode/mcp.json`.
- Root `AGENTS.md`, `CLAUDE.md` and `.github/copilot-instructions.md` are migrated like the agent folders.
- A `.gitignore` line naming a renamed directory names the new one; a duplicate is not added.
- `migrate status` reports any legacy spelling the scanner still finds in live files, so a leftover is never silent.
- After the development profile changes, every work ref and worktree of the old shape is either still a live unit the new profile sees, or reported by `work doctor` with its remedy (publish or retire); none is invisible.
- Hooks and `delendai.guard.*` keys follow the profile: installed where it needs them, removed where it does not.
- `guard install` in an adopting project configures a merge driver that resolves to a file present there (the shipped CLI), or none.
- The user-level host configs (`~/.claude.json`, `~/.codex/config.toml`) are migrated by an explicit, opt-in host-scope command, never by a workspace `migrate run`, and a dry run lists what it would change.
