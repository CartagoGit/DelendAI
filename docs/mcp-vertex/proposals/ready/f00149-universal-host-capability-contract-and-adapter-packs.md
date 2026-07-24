---
id: f00149
title: "universal host capability contract and adapter packs"
kind: feat
status: ready
type: proposal
track: host-adapters+plugins+adoption
date: 2026-07-24
---

# f00149 — universal host capability contract and adapter packs

## Goal

Make every mcp-vertex capability consistently available to any compatible host through a declarative capability contract, generated host packs, and optional lifecycle adapters without claiming control over unsupported host loops.

## why

MCP standardizes tool transport, but it does not standardize a host's native
skill discovery, durable instructions, lifecycle hooks, background execution
or permission model. Today those differences are scattered among per-host
files, which makes the same mcp-vertex installation behave unevenly even when
the server itself exposes the same plugins.

The universal baseline must therefore be the live MCP surface: every MCP host
gets the same tools, prompts, resources, knowledge and structured contracts.
Everything beyond that is an explicit capability of the host adapter, never an
assumption. This lets Codex, Claude, IDE agents and an unknown future client
use the same project protocol while preserving honest fallbacks where a client
cannot run hooks or resume work after a response.

## non-goals

- It does not make an MCP server control, wake, compact or spend quota in a
  host process that offers no lifecycle or execution API.
- It does not copy native host configuration into core or make core depend on
  a named provider.
- It does not replace a host's permission, authentication, trust or billing
  model.

## Slices

- global_gate: validate

### S1 — Host-neutral capability contract
- **Status**: done
- **Files**: `packages/core/src/lib/contracts/interfaces/host-capabilities.interface.ts`,
  `packages/core/src/lib/hosts/host-capability-profile.ts`,
  `packages/core/tests/src/lib/hosts/host-capability-profile.spec.ts`,
  `packages/core/src/public/index.ts`
- **Gate**: type
- **Acceptance**:
  - The contract models only generic host abilities: MCP, instructions, skill
    installation, lifecycle hooks and continuation execution.
  - It derives a safe baseline/fallback plan without naming a provider or
    fabricating an unsupported continuation capability.

### S2 — Generated adapter-pack manifest
- **Status**: done
- **Files**: `packages/core/src/lib/hosts/host-adapter-pack.ts`,
  `packages/core/tests/src/lib/hosts/host-adapter-pack.spec.ts`,
  `packages/core/src/public/index.ts`
- **Gate**: type
- **Acceptance**:
  - A host adapter declares capabilities once and receives a deterministic,
    bounded pack describing MCP, instruction, skill and lifecycle integration.
  - Every pack always exposes the MCP baseline; optional actions are omitted
    instead of being presented as supported.

### S3 — Concrete packs and honest fallbacks
- **Status**: pending
- **Files**: `config/external/README.md`, `config/external/codex/README.md`,
  `config/external/claude-code/README.md`, `docs/mcp-vertex/examples/host-capability-adapter.md`
- **Gate**: docs + type
- **Acceptance**:
  - Codex, Claude Code and the generic MCP profile are documented as adapter
    instances of the same contract, not divergent workflows.
  - Each declares the lifecycle/continuation behavior it actually supports
    and gives the safe manual fallback when it cannot resume a host turn.

### S4 — Adoption verifier
- **Status**: pending
- **Files**: `tools/scripts/verify/host-capability-packs.script.ts`,
  `tools/scripts/verify/host-capability-packs.script.spec.ts`, `package.json`
- **Gate**: verify + validate
- **Acceptance**:
  - CI validates every shipped adapter pack against the shared contract and
    rejects claims for capabilities the adapter does not declare.
  - The verifier remains host-neutral and works for an added future MCP host
    without changing the core model.

## acceptance

- Every compatible MCP host receives the full live mcp-vertex surface through
  one baseline integration.
- Native skills, instructions, hooks and continuation are additive adapter
  capabilities with explicit fallback behavior.
- No adapter reports that mcp-vertex can control a host lifecycle it cannot
  actually invoke.
