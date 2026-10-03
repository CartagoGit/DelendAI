---
id: x00870
title: "Every agent is held to the workflow, whatever its model or host"
kind: fix
status: ready
type: proposal
track: trust
date: 2026-10-03
---

# x00870 — Every agent is held to the workflow, whatever its model or host

## Goal

The configured workflow holds for every agent using delendai. A process is an agent unless the policy says an unidentified actor is a person, and the refusal on the integration branch names the workflow and how to get a unit.

## why

On 2026-10-03 twelve reviewer agents of other model families committed 30 commits directly onto develop in the shared checkout. The guard decides agent versus person from Claude-specific environment markers (CLAUDECODE, AI_AGENT), which other hosts do not set, so every agent rule silently did not apply to them. Several reviewers also signed with invented ids (minimaxm3, glm-5.3-max for GLM 5.3 Flash).

## non-goals

- Unit lease and verdict (own proposal).
- Changing the deliberate CI exemption: CI=true with no agent marker stays exempt.

## Slices

- global_gate: none

### S1 — One actor resolver, host markers, session marker, unknownActor policy key
- **Status**: pending
- **Files**: `docs/delendai/AGENT-BOOTSTRAP.md`, `packages/cli/src/commands/guard.command.spec.ts`, `packages/cli/src/commands/guard.command.ts`, `packages/cli/src/index.ts`, `packages/cli/src/lib/guard-hooks.service.spec.ts`, `packages/cli/src/lib/delendai-session.service.ts`, `packages/cli/src/lib/delendai-session.service.spec.ts`, `packages/cli/src/lib/stdio-context.factory.ts`, `packages/core/schema/delendai.config.schema.json`, `packages/core/src/cli.ts`, `packages/core/src/lib/contracts/constants/agent-environment.constant.ts`, `packages/core/src/lib/contracts/interfaces/development-policy.interface.ts`, `packages/core/src/lib/development-policy/git-guard.ts`, `packages/core/src/lib/development-policy/resolve.interface.ts`, `packages/core/src/lib/development-policy/resolve.ts`, `packages/core/src/lib/development-policy/served-work-model.ts`, `packages/core/src/lib/development-policy/validate.ts`, `packages/core/src/lib/plugins/development-config-schema.constant.ts`, `packages/core/src/lib/work-identity/agent-environment.helper.ts`, `packages/core/tests/src/lib/work-identity/agent-environment.helper.spec.ts`, `packages/core/src/lib/contracts/interfaces/git-actor.interface.ts`, `packages/core/src/lib/contracts/interfaces/policy-guard.interface.ts`, `packages/core/src/lib/development-policy/resolve-guard.ts`, `packages/core/src/lib/work-identity/git-actor.helper.ts`, `packages/core/tests/src/lib/development-policy/served-agent-identity.spec.ts`, `packages/core/tests/src/lib/work-identity/git-actor.helper.spec.ts`, `docs/delendai/agent-catalog.generated.json`
- **Gate**: none
- acceptance:
  - "Commits under each marker kind are refused on the integration branch."
  - "With no marker the outcome follows development.guard.unknownActor."
  - "A person explicitly allowed commits; CI=true with no marker is unaffected."
  - "Served instructions tell every agent to set DELENDAI_AGENT_ID to its exact model id."

## acceptance

- Commits under each marker kind are refused on the integration branch.
- With no marker the outcome follows development.guard.unknownActor.
- A person explicitly allowed commits; CI=true with no marker is unaffected.
- Served instructions tell every agent to set DELENDAI_AGENT_ID to its exact model id.
