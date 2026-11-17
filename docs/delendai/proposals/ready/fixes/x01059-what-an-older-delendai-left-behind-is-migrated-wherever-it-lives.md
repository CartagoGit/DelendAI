---
id: x01059
title: "What an older delendai left behind is migrated wherever it lives"
kind: fix
status: ready
type: proposal
track: general
date: 2026-11-11
---

# x01059 — What an older delendai left behind is migrated wherever it lives

## goal

Anything an older delendai left on a machine or in a project is found and migrated by the product itself, automatically, wherever it lives: user-level host configs, old clones, stale launch commands, old ref namespaces. A registry of known legacy residue drives it; each entry has a detector and an idempotent migration. Code decides, never an agent.

Finding, 2026-11-11: the owner's ~/.codex/config.toml still declared [mcp_servers.mcp-vertex], the product's name from months ago. It ran the host server from an old full clone (~/_projects/mcp-vertex, develop of 2026-10-15) with --config=<workspace>/mcp-vertex.config.json, a file the project does not have, beside the correct DelendAI entry. Every Codex session of another project (api-source-tanit) started two servers, one running month-old code against that workspace.

What exists today and where it stops: migrate:rebrand (tools/scripts/migrate/rebrand-propagate.script.ts) sweeps the repository. DEFAULT_MIGRATIONS (packages/core/src/lib/workspace-migration/migration-registry.ts) run through ensureWorkspaceMigrated at host boot (tools/scripts/host/host-server.script.ts) and from the migrate command (packages/cli/src/commands/migrate.command.ts); they cover workspace files, including project-level host configs (migrators/host-config.migrator.ts). The host-scope migrator (host-scope/global-config.migrator.ts) reads ~/.claude.json and ~/.codex/config.toml but rewrites only project entries it can prove a workspace owns; it never looks at mcp_servers entries naming an old server. Nothing reaches VS Code user mcp.json and settings.json (WSL or Windows), old clones, or stale processes.

Design, built on those pieces rather than beside them: (1) a legacy-residue registry, a list of entries {id, since, kind (name | config-key | file | launch-command | clone | ref-namespace | process), scope (machine | project), detect(ctx), migrate(ctx), ownership}; entries are data plus two pure-ish functions over an injected IO, like the host-scope migrator. (2) Host-config migrators for user-level files of every host in AGENT_HOSTS (packages/core/src/lib/contracts/constants/agent-hosts.constant.ts): Codex ~/.codex/config.toml; Claude ~/.claude.json and .mcp.json; VS Code user mcp.json and settings.json at the Linux, WSL and Windows (/mnt/c/Users/*/AppData/Roaming/Code/User) paths; other hosts from the registry. An old-name server entry is removed or rewritten to the current launch shape only when it is delendai's own (name or launch command matches a registry entry); anything else is asked about, never touched silently. (3) Every user file is backed up (timestamped copy under the delendai user state directory) before the first byte changes; nothing is deleted without a backup; old clones and stale processes are reported with the exact command, and acted on only with confirmation. (4) It runs at server boot (quiet when clean, one report line per change otherwise), in doctor and in init, and the report names what was found, changed and backed up. (5) Per machine and per project: a machine-scope run is recorded in the user state so it does not repeat; a project policy key opts out. (6) A lint makes every layout change ship its migration.

## why

Each rename or layout change migrates the repository and leaves the user's machine behind, so the residue grows with every release and hurts every project, not only this one: a month-old server started beside the current one in an unrelated workspace. Fixing it by hand on one machine does not reach other users. This follows the owner's rule that every layout change ships its migration, and the product principles: robust (no stale server, no lost file thanks to the backup), agnostic (any host, any project), easy (automatic, default on).

## non-goals

- Deleting an old clone or killing a process without confirmation.
- Editing any host config entry that is not demonstrably delendai's own without asking.
- Implementing anything in this proposal: it is docs only; the slices below do the work.

## slices

- global_gate: none

### S1 — Legacy-residue registry and detectors
- **Status**: pending
- **Files**: `packages/core/src/lib/workspace-migration/migration-registry.ts`
- **Gate**: type
- acceptance:
  - "New files declared in prose: packages/core/src/lib/workspace-migration/legacy-residue/legacy-residue-registry.ts, its entry and context interfaces under contracts, and its spec."
  - "A registry entry has an id, the release it was added in, a kind (name, config-key, file, launch-command, clone, ref-namespace, process), a scope (machine or project), a detect function and an idempotent migrate function over an injected IO; no entry touches the real filesystem directly."
  - "The entry for the mcp-vertex name and the mcp-vertex.config.json launch shape exists and is detected in a fixture."
  - "Running detect then migrate twice reports changes the first time and none the second."
  - "The registry is exported once and DEFAULT_MIGRATIONS consumes it, so workspace and user-level residue share one list."

### S2 — User-level host-config migrators
- **Status**: pending
- **DependsOn**: [S1]
- **Files**: `packages/core/src/lib/workspace-migration/host-scope/global-config.migrator.ts`, `packages/core/src/lib/contracts/constants/agent-hosts.constant.ts`
- **Gate**: type
- acceptance:
  - "New files declared in prose: one migrator per host family under packages/core/src/lib/workspace-migration/host-scope/, and the user-level path resolver for Linux, WSL and Windows."
  - "Codex ~/.codex/config.toml, Claude ~/.claude.json and .mcp.json, and VS Code user mcp.json and settings.json (Linux, WSL, Windows paths) are covered, and every other host in AGENT_HOSTS declares its user-level config paths there or is reported as not covered."
  - "An old-name mcp server entry that matches a registry entry is removed or rewritten to the current launch shape; an entry that does not match is left byte for byte and listed as a question."
  - "Before the first write to a user file a timestamped backup is written and its path is in the report; a failed backup aborts the edit."
  - "Comments and unrelated keys survive the rewrite (JSONC and TOML)."

### S3 — Boot hook and its report
- **Status**: pending
- **DependsOn**: [S1, S2]
- **Files**: `tools/scripts/host/host-server.script.ts`
- **Gate**: type
- acceptance:
  - "New files declared in prose: the boot runner and the report renderer next to the workspace-migration services in packages/core."
  - "The host server runs the residue registry at boot beside ensureWorkspaceMigrated; a clean machine prints nothing."
  - "Each change prints one stderr line naming the entry, the file and the backup; questions are printed once and recorded so they are not asked at every boot."
  - "A machine-scope run is recorded in the user state directory and not repeated until the registry changes."
  - "A project policy key turns the run off for that project, and a user setting turns it off for the machine; both are read from the existing configuration, not a new file."
  - "The boot never fails because a user file is unreadable: it reports and continues."

### S4 — doctor and init integration
- **Status**: pending
- **DependsOn**: [S3]
- **Files**: `packages/cli/src/commands/doctor.ts`, `packages/cli/src/commands/init/init.command.ts`
- **Gate**: type
- acceptance:
  - "New files declared in prose: a doctor check under packages/cli/src/commands/doctor-checks/ and its spec."
  - "delendai doctor lists residue found and not yet migrated, including old clones (by path or remote) and stale processes, with the exact command for each."
  - "delendai doctor --fix and init apply the migrations that need no question; those that need one prompt, and in a non-interactive run they only report."
  - "The CLI help summary and the i18n entries for the new output exist."

### S5 — A spec per migrator with fixture configs
- **Status**: pending
- **DependsOn**: [S2]
- **Files**: `packages/core/tests/src/lib/workspace-migration/migrators/host-config.migrator.spec.ts`
- **Gate**: type
- acceptance:
  - "New files declared in prose: one spec per host migrator under packages/core/tests/src/lib/workspace-migration/host-scope/ with fixture configs for the old name, the old launch shape, a mixed file with foreign entries, and a clean file."
  - "Each spec proves idempotence, the backup, the untouched foreign entry and the not-covered report."
  - "Fixtures that spell the old product name carry the legacy-name exemption."
  - "Each test names its max time and uses no real timers."

### S6 — Lint: a rename ships its registry entry
- **Status**: pending
- **DependsOn**: [S1]
- **Files**: `package.json`
- **Gate**: lint
- acceptance:
  - "New files declared in prose: tools/scripts/lint/legacy-residue-registry.script.ts, its spec and its baseline, wired into lint:architecture and validate:run."
  - "When a diff against the integration branch renames or removes a product name, a config key, a generated file name or a launch shape that the previous release emitted, the lint fails unless a registry entry names it."
  - "The lint reads the previous release's emitted names from a committed snapshot, like the cache-layout ratchet, so it needs no network."
  - "The lint states what it measured and fails on an empty scan, so it cannot pass over nothing."

## acceptance

- New files declared in prose: packages/core/src/lib/workspace-migration/legacy-residue/legacy-residue-registry.ts, its entry and context interfaces under contracts, and its spec.
- A registry entry has an id, the release it was added in, a kind (name, config-key, file, launch-command, clone, ref-namespace, process), a scope (machine or project), a detect function and an idempotent migrate function over an injected IO; no entry touches the real filesystem directly.
- The entry for the mcp-vertex name and the mcp-vertex.config.json launch shape exists and is detected in a fixture.
- Running detect then migrate twice reports changes the first time and none the second.
- The registry is exported once and DEFAULT_MIGRATIONS consumes it, so workspace and user-level residue share one list.
- New files declared in prose: one migrator per host family under packages/core/src/lib/workspace-migration/host-scope/, and the user-level path resolver for Linux, WSL and Windows.
- Codex ~/.codex/config.toml, Claude ~/.claude.json and .mcp.json, and VS Code user mcp.json and settings.json (Linux, WSL, Windows paths) are covered, and every other host in AGENT_HOSTS declares its user-level config paths there or is reported as not covered.
- An old-name mcp server entry that matches a registry entry is removed or rewritten to the current launch shape; an entry that does not match is left byte for byte and listed as a question.
- Before the first write to a user file a timestamped backup is written and its path is in the report; a failed backup aborts the edit.
- Comments and unrelated keys survive the rewrite (JSONC and TOML).
- New files declared in prose: the boot runner and the report renderer next to the workspace-migration services in packages/core.
- The host server runs the residue registry at boot beside ensureWorkspaceMigrated; a clean machine prints nothing.
- Each change prints one stderr line naming the entry, the file and the backup; questions are printed once and recorded so they are not asked at every boot.
- A machine-scope run is recorded in the user state directory and not repeated until the registry changes.
- A project policy key turns the run off for that project, and a user setting turns it off for the machine; both are read from the existing configuration, not a new file.
- The boot never fails because a user file is unreadable: it reports and continues.
- New files declared in prose: a doctor check under packages/cli/src/commands/doctor-checks/ and its spec.
- delendai doctor lists residue found and not yet migrated, including old clones (by path or remote) and stale processes, with the exact command for each.
- delendai doctor --fix and init apply the migrations that need no question; those that need one prompt, and in a non-interactive run they only report.
- The CLI help summary and the i18n entries for the new output exist.
- New files declared in prose: one spec per host migrator under packages/core/tests/src/lib/workspace-migration/host-scope/ with fixture configs for the old name, the old launch shape, a mixed file with foreign entries, and a clean file.
- Each spec proves idempotence, the backup, the untouched foreign entry and the not-covered report.
- Fixtures that spell the old product name carry the legacy-name exemption.
- Each test names its max time and uses no real timers.
- New files declared in prose: tools/scripts/lint/legacy-residue-registry.script.ts, its spec and its baseline, wired into lint:architecture and validate:run.
- When a diff against the integration branch renames or removes a product name, a config key, a generated file name or a launch shape that the previous release emitted, the lint fails unless a registry entry names it.
- The lint reads the previous release's emitted names from a committed snapshot, like the cache-layout ratchet, so it needs no network.
- The lint states what it measured and fails on an empty scan, so it cannot pass over nothing.
