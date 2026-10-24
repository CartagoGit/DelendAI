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
- **Files**: `packages/core/src/lib/contracts/constants/agent-hosts.constant.ts`, `packages/core/src/lib/contracts/interfaces/agent-identity.interface.ts`, `packages/core/src/lib/development-policy/profiles.constant.ts`, `plugins/usage-tracking/src/lib/detect-agent.ts`, `config/external/README.md`, `docs/delendai/FILE-CONVENTIONS.md`
- **Gate**: type
- acceptance:
  - "Detection, scaffold and instructions read AGENT_HOSTS; a spec fails if a host appears in one and not the others (G65, D39)."
  - "Each declared host has its config/external material or is removed (G66)."

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
- Each declared host has its config/external material or is removed (G66).
- SIGINT and SIGTERM reach the child; no server survives its client (G113).
- A server whose source changed since start reports itself stale in delendai_status and refuses mutations until restarted (G27).
- The bridge is keyed by conversation, so one conversation never reads another's model (G68).
- status, overview and adopt create no file (G124).
