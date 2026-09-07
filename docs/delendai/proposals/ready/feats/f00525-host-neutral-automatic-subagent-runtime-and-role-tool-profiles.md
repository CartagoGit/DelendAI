---
id: f00525
title: "Host-neutral automatic subagent runtime and role tool profiles"
kind: feat
status: ready
type: proposal
track: architecture
date: 2026-09-07
---

# f00525 — Host-neutral automatic subagent runtime and role tool profiles

## Goal

Make agent-orchestrator dispatch automatic for every DelendAI host that exposes a native subagent capability, while giving each canonical agent role the smallest correct tool surface and preserving solo orchestration when delegation is unnecessary.

## why

agent-orchestrator currently expects a function-valued portFactory inside JSON options, so projects fail at dispatch even though the plugin is loaded. Generated agent profiles also grant nearly the same tools to every role, which does not express that the orchestrator may work alone and delegate selectively while verifiers should not mutate files.

## non-goals

- Do not put functions in delendai.config.json.
- Do not use FakeDispatchPort in production.
- Do not add a second orchestration, memory, routing, or workflow system.
- Do not copy host-specific external plugin code or names.
- Do not grant mutation tools to verifier or investigator roles by default.

## Slices

- global_gate: type

### S1 — Core host subagent capability contract and automatic context wiring
- **Status**: pending
- **Files**: `packages/contracts/src/host-subagent-runtime.interface.ts`, `packages/contracts/src/index.ts`, `packages/core/src/lib/plugins/plugin-contract.ts`, `packages/core/src/lib/cli/assemble.ts`, `packages/core/src/lib/host`
- **Gate**: type
- acceptance:
  - "Expose a host-neutral subagent runtime contract with spawnSubagent and capability metadata."
  - "Inject the runtime through IMcpPluginContext without serializing it into plugin options."
  - "Provide a deterministic no-runtime behavior for hosts that do not expose native subagents."
  - "Keep existing test contexts source-compatible."

### S2 — Agent orchestrator consumes host runtime automatically
- **Status**: pending
- **DependsOn**: [S1]
- **Files**: `plugins/agent-orchestrator/src/index.ts`, `plugins/agent-orchestrator/src/lib/dispatch`, `plugins/agent-orchestrator/src/public/index.ts`, `plugins/agent-orchestrator/tests`
- **Gate**: type
- acceptance:
  - "Use ctx host runtime as the production dispatch port when available."
  - "Keep explicit portFactory only as a compatibility/test seam."
  - "Return a structured capability-unavailable error instead of asking projects to configure a function in JSON."
  - "Preserve allowFakeDispatchPort as test-only behavior."
  - "Add tests proving dispatch uses the injected runtime without portFactory."

### S3 — Canonical role tool profiles and generated host adapters
- **Status**: pending
- **DependsOn**: [S1]
- **Files**: `packages/core/src/lib/agents/agent-tool-profiles.ts`, `packages/core/src/lib/scaffold/scaffold-host.ts`, `packages/core/src/lib/contracts/constants/agent-slots.constant.ts`, `packages/core/tests`
- **Gate**: type
- acceptance:
  - "Define role profiles for orchestrator, implementation_runner, technical_investigator, proposal_guardian, and delivery_verifier."
  - "Orchestrator profile includes direct work tools and optional delegation capability."
  - "Implementation runner can read/edit/execute and use MCP tools."
  - "Investigator is read/search/analysis oriented and cannot edit by default."
  - "Verifier can read/search/execute and cannot mutate by default."
  - "Generated Copilot, Claude, and Codex adapters consume the same profile source."

### S4 — Documentation and host integration contract
- **Status**: pending
- **DependsOn**: [S1, S2, S3]
- **Files**: `docs/delendai/ADOPTER-SURFACE-MODE.md`, `plugins/agent-orchestrator/README.md`, `docs/delendai/proposals/ready/fixes/f00525-host-neutral-automatic-subagent-runtime-and-role-tool-profiles.md`
- **Gate**: type
- acceptance:
  - "Document which agent to use by default."
  - "Document solo orchestrator behavior versus delegated slices."
  - "Document host adapter responsibility and graceful behavior when native subagents are unavailable."
  - "Remove the implication that portFactory belongs in JSON configuration."

## acceptance

- Expose a host-neutral subagent runtime contract with spawnSubagent and capability metadata.
- Inject the runtime through IMcpPluginContext without serializing it into plugin options.
- Provide a deterministic no-runtime behavior for hosts that do not expose native subagents.
- Keep existing test contexts source-compatible.
- Use ctx host runtime as the production dispatch port when available.
- Keep explicit portFactory only as a compatibility/test seam.
- Return a structured capability-unavailable error instead of asking projects to configure a function in JSON.
- Preserve allowFakeDispatchPort as test-only behavior.
- Add tests proving dispatch uses the injected runtime without portFactory.
- Define role profiles for orchestrator, implementation_runner, technical_investigator, proposal_guardian, and delivery_verifier.
- Orchestrator profile includes direct work tools and optional delegation capability.
- Implementation runner can read/edit/execute and use MCP tools.
- Investigator is read/search/analysis oriented and cannot edit by default.
- Verifier can read/search/execute and cannot mutate by default.
- Generated Copilot, Claude, and Codex adapters consume the same profile source.
- Document which agent to use by default.
- Document solo orchestrator behavior versus delegated slices.
- Document host adapter responsibility and graceful behavior when native subagents are unavailable.
- Remove the implication that portFactory belongs in JSON configuration.
