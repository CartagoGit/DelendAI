---
id: f00525
title: "Host-neutral automatic subagent runtime and role tool profiles"
kind: feat
status: review
type: proposal
track: architecture
date: 2026-09-07
last-transition-id: f1705cc5-038d-404c-8046-6196b79a930a
last-correlation-id: f1705cc5-038d-404c-8046-6196b79a930a
last-transition-from: in-progress
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
- **Status**: done
- **Files**: `packages/contracts/src/host-subagent-runtime.interface.ts`, `packages/contracts/src/index.ts`, `packages/core/src/lib/plugins/plugin-contract.ts`, `packages/core/src/lib/cli/assemble.ts`, `packages/core/src/lib/host`
- **Gate**: type
- acceptance:
  - "Expose a host-neutral subagent runtime contract with spawnSubagent and capability metadata."
  - "Inject the runtime through IMcpPluginContext without serializing it into plugin options."
  - "Provide a deterministic no-runtime behavior for hosts that do not expose native subagents."
  - "Keep existing test contexts source-compatible."
- review-state: done
- review-implementer: swarm
- review-reviewer: Claude Opus 5
- review-log: approved — `IHostSubagentRuntime` in `packages/contracts/src/host-subagent-runtime.interface.ts` carries `hostId` plus `spawnSubagent`, and reaches plugins through `IMcpPluginContext.subagentRuntime` (`plugin-contract.ts:42`), fed from `assembleCliConfig({ hostSubagentRuntime })`. The contract states in its own header that it is "deliberately absent from JSON configuration", which is the property the acceptance asks for.

### S2 — Agent orchestrator consumes host runtime automatically
- **Status**: done
- **DependsOn**: [S1]
- **Files**: `plugins/agent-orchestrator/src/index.ts`, `plugins/agent-orchestrator/src/lib/dispatch`, `plugins/agent-orchestrator/src/public/index.ts`, `plugins/agent-orchestrator/tests`
- **Gate**: type
- acceptance:
  - "Use ctx host runtime as the production dispatch port when available."
  - "Keep explicit portFactory only as a compatibility/test seam."
  - "Return a structured capability-unavailable error instead of asking projects to configure a function in JSON."
  - "Preserve allowFakeDispatchPort as test-only behavior."
  - "Add tests proving dispatch uses the injected runtime without portFactory."
- review-state: done
- review-implementer: swarm
- review-reviewer: Claude Opus 5
- review-log: approved — `resolveDispatchPort({ subagentRuntime })` prefers the injected runtime, `allowFakeDispatchPort` is an explicit opt-in documented as tests/fixtures only, and the absent-runtime path returns `MissingDispatchPortError` through `dispatchPortRefusal` rather than a throw. `port-resolution.helper.spec.ts` covers dispatch through the injected runtime with no `portFactory`.

### S3 — Canonical role tool profiles and generated host adapters
- **Status**: done
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
- review-state: done
- review-implementer: swarm
- review-reviewer: Claude Opus 5
- review-log: approved — `agent-tool-profiles.ts` defines all five roles with the claimed shape; spot-checked `technical_investigator` (`directWork: false`, `canDelegate: false`, purpose states it reports without editing).

### S4 — Documentation and host integration contract
- **Status**: done
- **DependsOn**: [S1, S2, S3]
- **Files**: `docs/delendai/ADOPTER-SURFACE-MODE.md`, `plugins/agent-orchestrator/README.md`, `docs/delendai/proposals/ready/fixes/f00525-host-neutral-automatic-subagent-runtime-and-role-tool-profiles.md`
- **Gate**: type
- acceptance:
  - "Document which agent to use by default."
  - "Document solo orchestrator behavior versus delegated slices."
  - "Document host adapter responsibility and graceful behavior when native subagents are unavailable."
  - "Remove the implication that portFactory belongs in JSON configuration."
- review-state: done
- review-implementer: swarm
- review-reviewer: Claude Opus 5
- review-log: approved — documentation slice; the `portFactory`-in-JSON implication is gone from the plugin options docstring, which now marks it a compatibility/test seam.

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

## Notes

Always use the `orchestrator` agent as the entry point. It may work alone for
small tasks and delegates only non-trivial claimed slices. The
`implementation_runner` owns implementation slices, `proposal_guardian` owns
proposal workflow maintenance, `technical_investigator` is read-only, and
`delivery_verifier` validates independently without mutation tools. Native
subagent creation is injected by the host at runtime; `portFactory` is not a
project configuration mechanism.
