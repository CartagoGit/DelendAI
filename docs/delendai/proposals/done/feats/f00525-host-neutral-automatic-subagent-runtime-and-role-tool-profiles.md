---
id: f00525
title: "Host-neutral automatic subagent runtime and role tool profiles"
kind: feat
status: done
type: proposal
track: architecture
date: 2026-09-07
last-transition-id: 1d6d638f-7ce1-4123-8590-ae303bc8682f
last-correlation-id: 1d6d638f-7ce1-4123-8590-ae303bc8682f
last-transition-from: review
shipped-in:
  - "8a965a50db61d2879d67cdb5d821c82317cd6445"
  - "89d257371327a9383f740b765660468caa923559"
  - "a69ca5d1ee026e033e2e43ea6a738b36a21fbe30"
  - "1bc6b6b6ac426b72d56e79f680da7120c4fcac65"
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
- review-implementer: unrecorded
- review-reviewer: minimax-m3
- review-log: approved by minimax-m3 — f00525 S1 introduces packages/contracts/src/host-subagent-runtime.interface.ts (IHostSubagentRuntime with spawnSubagent + hostId metadata) and wires it through assemble.ts as deps.hostSubagentRuntime, then through IMcpPluginContext as optional subagentRuntime. Runtime is a JS value, never JSON. No-runtime hosts get undefined and continue. agent-orchestrator port-resolution spec: 11/11 pass.
- review-attribution: unrecorded — nothing in Git names who delivered 8a965a50db61d2879d67cdb5d821c82317cd6445: no work ref of this project in its message or in the merge that brought it into develop, and no Co-Authored-By trailer; independence could not be verified, opened by minimax-m3

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
- review-implementer: unrecorded
- review-reviewer: minimax-m3
- review-log: approved by minimax-m3 — resolveDispatchPort() now reads opts.subagentRuntime first (production), falls back to portFactory (compatibility seam) and finally allowFakeDispatchPort (test-only). Missing runtime + missing portFactory + no test opt-in throws MissingDispatchPortError — a structured error pointing hosts to a subagentRuntime adapter rather than JSON portFactory. port-resolution.helper.spec.ts: 11/11 pass.
- review-attribution: unrecorded — nothing in Git names who delivered 89d257371327a9383f740b765660468caa923559: no work ref of this project in its message or in the merge that brought it into develop, and no Co-Authored-By trailer; independence could not be verified, opened by minimax-m3

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
- review-implementer: unrecorded
- review-reviewer: minimax-m3
- review-log: approved by minimax-m3 — f00525 S3 defines AGENT_TOOL_PROFILES with five slots (orchestrator / implementation_runner / technical_investigator / proposal_guardian / delivery_verifier). Orchestrator has canDelegate:true + agent tool; runner is read/edit/execute/MCP; investigator + verifier share read/search/execute/todo with no 'edit'. scaffold-host.ts wires all three host generators (Copilot, Claude, Codex) through agentToolProfile(slot) so they share one source. scaffold-host.spec.ts: 38/38 pass.
- review-attribution: unrecorded — nothing in Git names who delivered a69ca5d1ee026e033e2e43ea6a738b36a21fbe30: no work ref of this project in its message or in the merge that brought it into develop, and no Co-Authored-By trailer; independence could not be verified, opened by minimax-m3

### S4 — Documentation and host integration contract
- **Status**: done
- **DependsOn**: [S1, S2, S3]
- **Files**: `docs/delendai/ADOPTER-SURFACE-MODE.md`, `plugins/agent-orchestrator/README.md`, `docs/delendai/proposals/done/feats/f00525-host-neutral-automatic-subagent-runtime-and-role-tool-profiles.md`
- **Gate**: type
- acceptance:
  - "Document which agent to use by default."
  - "Document solo orchestrator behavior versus delegated slices."
  - "Document host adapter responsibility and graceful behavior when native subagents are unavailable."
  - "Remove the implication that portFactory belongs in JSON configuration."
- review-state: done
- review-implementer: unrecorded
- review-reviewer: minimax-m3
- review-log: approved by minimax-m3 — f00525 S4 is documentation-only, delivered by commit 1bc6b6b6a (the chore update that added the orchestrator-role table + host-adapter paragraph + portFactory-not-JSON warning to docs/delendai/ADOPTER-SURFACE-MODE.md §4). All four acceptance items verified directly in the current file. plugins/agent-orchestrator/README.md mirrors the role table for cross-reference.
- review-attribution: unrecorded — nothing in Git names who delivered 1bc6b6b6ac426b72d56e79f680da7120c4fcac65: no work ref of this project in its message or in the merge that brought it into develop, and no Co-Authored-By trailer; independence could not be verified, opened by minimax-m3

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
