---
id: x01046
title: "A spec sees the runner's session and agent variables: clear them before every spec file"
kind: fix
status: ready
type: proposal
track: general
date: 2026-11-07
---

# x01046 — A spec sees the runner's session and agent variables: clear them before every spec file

## goal

No spec depends on the environment of the shell that runs it. The shared test setup clears every delendai variable, every agent marker and both session variables before each spec file, so a spec sets only what it tests. Three work e2e specs failed under an exported DELENDAI_SESSION_ID because the setup cleared DELENDAI_SESSION and not DELENDAI_SESSION_ID.

## why

TODO: why this work matters now.

## non-goals

- TODO: what this proposal deliberately skips.

## slices

- global_gate: none

### S1 — Every spec file starts from an environment with no delendai or agent variables
- **Status**: pending
- **Files**: `packages/test-kit/src/lib/hermetic-environment.helper.ts`, `packages/test-kit/src/lib/contracts/constants/hermetic-environment.constant.ts`, `packages/test-kit/src/index.ts`, `packages/test-kit/tests/src/lib/hermetic-environment.helper.spec.ts`, `tools/scripts/test/hermetic-agent-identity-setup.ts`, `tools/scripts/test/hermetic-agent-identity-setup.spec.ts`, `vitest.shared.ts`, `packages/core/src/lib/contracts/constants/agent-environment.constant.ts`, `packages/core/src/lib/work-units/work-unit-shared.service.ts`, `packages/core/src/lib/work-units/unit-liveness.service.ts`, `packages/cli/src/commands/review.command.ts`
- **Gate**: type
- acceptance:
  - "The shared vitest setup removes every DELENDAI_* variable except the runner switches it names (DELENDAI_RECORD_READS, DELENDAI_TEST_*), every agent marker (AGENT_ENVIRONMENT_MARKERS, CLAUDECODE, AI_AGENT, host prefixes) and both session variables (DELENDAI_SESSION, DELENDAI_SESSION_ID) before each spec file; the hermetic setups that follow set their own values after it."
  - "The rule lives in @delendai/test-kit (clearAmbientEnvironment) and the setup file only calls it."
  - "DELENDAI_SESSION_ID is one named constant in core, read through it by work-unit-shared, unit-liveness and the review command."
  - "A spec run under DELENDAI_SESSION_ID, DELENDAI_AGENT_ID, CLAUDECODE and AI_AGENT exported in the shell sees none of them, and runWorkUnit enter without --session gives a fresh session."

## acceptance

- The shared vitest setup removes every DELENDAI_* variable except the runner switches it names (DELENDAI_RECORD_READS, DELENDAI_TEST_*), every agent marker (AGENT_ENVIRONMENT_MARKERS, CLAUDECODE, AI_AGENT, host prefixes) and both session variables (DELENDAI_SESSION, DELENDAI_SESSION_ID) before each spec file; the hermetic setups that follow set their own values after it.
- The rule lives in @delendai/test-kit (clearAmbientEnvironment) and the setup file only calls it.
- DELENDAI_SESSION_ID is one named constant in core, read through it by work-unit-shared, unit-liveness and the review command.
- A spec run under DELENDAI_SESSION_ID, DELENDAI_AGENT_ID, CLAUDECODE and AI_AGENT exported in the shell sees none of them, and runWorkUnit enter without --session gives a fresh session.
