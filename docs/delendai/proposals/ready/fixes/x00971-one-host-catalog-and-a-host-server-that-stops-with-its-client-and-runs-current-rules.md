---
id: x00971
title: "One host catalog, and a host server that stops with its client and runs current rules"
kind: fix
status: ready
type: proposal
track: a00095-consistency
date: 2026-10-24
---

# x00971 — One host catalog, and a host server that stops with its client and runs current rules

## goal

AGENT_HOSTS is the only list of hosts (scaffold, runtime detection, usage tracking, instructions), every declared host ships its material, the provider-model bridge is per conversation, the supervisor forwards SIGINT and SIGTERM, a long-lived server notices it runs stale rules, and read-only commands create no cache.

## why

Joint audit a00095. G65: three host catalogs and none matches the others. G66: windsurf and agents-md are declared without material (no config/external directory). D39: the host universe is split between scaffold, runtime and manual instructions; Aider is detected but not in AGENT_HOSTS. G68: the identity bridge provider-model.json is one machine-wide file shared by every conversation. G27: a long-lived host server applies the rules it started with. G113: the host server supervisor does not trap SIGINT/SIGTERM; each Ctrl-C leaves an MCP server behind. G124: read-only commands (status, overview, adopt) create .cache/delendai/.

## non-goals

- Identity spelling (x00923).

## slices

- global_gate: type

### S1 — One catalog with material for each host
- **Status**: pending
- **Files**: `packages/cli/src/contracts/interfaces/init.interface.ts`, `packages/cli/src/lib/init/init-host-instructions.service.spec.ts`, `packages/cli/src/lib/init/init-host-instructions.service.ts`, `packages/cli/src/lib/init/init-host-snapshot.service.spec.ts`, `packages/cli/src/lib/init/init-host-snapshot.service.ts`, `packages/cli/src/lib/init/init-hosts.helper.spec.ts`, `packages/cli/src/lib/init/init-hosts.helper.ts`, `packages/cli/src/lib/init/init-render.service.ts`, `packages/core/src/cli.ts`, `packages/core/src/contracts/index.ts`, `packages/core/src/lib/bootstrap/agent-config-rules.ts`, `packages/core/src/lib/contracts/constants/agent-hosts.constant.ts`, `packages/core/src/lib/contracts/interfaces/agent-host.interface.ts`, `packages/core/src/lib/hosts/agent-host-name.helper.ts`, `packages/core/tests/src/lib/bootstrap/agent-config-rules.spec.ts`, `packages/core/tests/src/lib/contracts/constants/agent-hosts.constant.spec.ts`, `plugins/adaptive-optimizer/src/lib/services/optimize-run.service.ts`, `plugins/proposals/src/lib/contracts/constants/host-instruction-files.constant.ts`, `plugins/proposals/tests/src/lib/tools/scan-host-instructions.tool.spec.ts`, `plugins/usage-tracking/src/lib/detect-agent.ts`, `plugins/usage-tracking/src/lib/services/usage-rollup.service.ts`, `plugins/usage-tracking/src/public/index.ts`, `plugins/usage-tracking/tests/src/lib/detect-agent.spec.ts`, `plugins/usage-tracking/tests/src/lib/plugin.spec.ts`
- **Gate**: type
- acceptance:
  - "Detection, scaffold and instructions read AGENT_HOSTS; a spec fails if a host appears in one and not the others (G65, D39)."
  - "Every host that declares an instructions file gets delendai's block from init when the project uses it, and every reader of instruction files (init, bootstrap analysis, the proposals scan) knows each file a host declares (G66)."

### S2 — The server process
- **Status**: pending
- **Files**: `tools/scripts/host/host-supervisor.ts`, `tools/scripts/host/host-supervisor-process.ts`, `tools/scripts/host/host-server.script.ts`
- **Gate**: type
- acceptance:
  - "SIGINT and SIGTERM reach the child; no server survives its client (G113)."
  - "A server whose source changed since start reports itself stale in delendai_status and refuses mutations until restarted (G27)."

### S3 — The bridge and read-only commands
- **Status**: pending
- **Files**: `packages/core/src/lib/work-identity/provider-model-bridge.helper.ts`, `packages/core/src/lib/work-identity/provider-model-bridge.constant.ts`, `packages/cli/src/commands/doctor.ts`
- **Gate**: type
- acceptance:
  - "The bridge is keyed by conversation, so one conversation never reads another's model (G68)."
  - "status, overview and adopt create no file (G124)."

## acceptance

- Detection, scaffold and instructions read AGENT_HOSTS; a spec fails if a host appears in one and not the others (G65, D39).
- Every host that declares an instructions file gets delendai's block from init when the project uses it, and every reader of instruction files (init, bootstrap analysis, the proposals scan) knows each file a host declares (G66).
- SIGINT and SIGTERM reach the child; no server survives its client (G113).
- A server whose source changed since start reports itself stale in delendai_status and refuses mutations until restarted (G27).
- The bridge is keyed by conversation, so one conversation never reads another's model (G68).
- status, overview and adopt create no file (G124).

## notes
- S1, 2026-10-27: `config/external/` holds this repository's own bridges (`.aider.conf.yml`, `.cursorrules`), not what delendai ships for a host, so G66 is read as the material delendai writes: init wrote its instructions block into three fixed files (`.github/copilot-instructions.md`, `CLAUDE.md`, `AGENTS.md`) whatever the project used, so Windsurf, Cursor, Gemini and Continue were declared and never written for. The block now goes into the instructions file of each host the project uses (declared, found, or Copilot, Claude Code and AGENTS.md agents by default), read from `AGENT_HOSTS`.
- S1: the parallel host lists that remained were usage-tracking's client table (an object, so `agent-slots-in-sync` never saw it), bootstrap's agent-config rules, init's instruction sources and snapshot targets, and the proposals scan. Each is now derived from `AGENT_HOSTS`, with `legacyInstructions` for the files a host still reads but delendai never writes (`.cursorrules`, `.continuerules`, `.clinerules`, `.codex/instructions.md`, Aider's config). Usage records now name an agent by its host id (`claude`, not `claude-code`); rollups read older records through the same lookup, so history is not split.
- S1 also fixes the snapshot's "already canonical" test: its copy of the block differed from what init writes, so a file init had written was never recognised as canonical.
