# AGENT.md — plugin `plugins/test-policy`

> Below the `<!-- mcp-vertex:begin agent-md -->
## Purpose

- Test policy mode (TDD, tests-after, free, none).

## Public API

- isTestPolicyMode
- POLICY_GUIDANCE
- resolveTestPolicy
- TEST_POLICY_MODES
- type IResolvedTestPolicy
- type IResolveTestPolicyInput
- type ITestPolicyMode
- type ITestPolicySource
- clearPolicyOverride
- readPolicyOverride
- writePolicyOverride
- type IPolicyOverride

## Depends on

- @modelcontextprotocol/sdk
- zod
- @delendai/core

## Writes

- <host workspace>/.mcp-vertex/cache/test-policy/

## Entry points

- ./dist/index.js
- src/index.ts (default export → IMcpPlugin)

## Tests

- plugins/test-policy/tests/src/lib/policy-store.spec.ts
- plugins/test-policy/tests/src/lib/policy.spec.ts
- plugins/test-policy/tests/src/lib/tools/policy-tools.spec.ts

## Do not

- Do not run `git stash`; this repo forbids stashes (see `tools/scripts/lint/no-stashes.script.ts`) — a shared worktree can lose another agent's stashed work.
- Do not hand-edit content between `<!-- mcp-vertex:begin -->`/`<!-- mcp-vertex:end -->` markers; regenerate via the owning `gen:*` script instead.
- Do not import `@delendai/core/lib/...`; use `@delendai/core/public`.
- Do not run user-facing shell or destructive tools without `dryRunSupported: true`.
- Do not surface absolute host paths; use `workspaceRoot`-relative paths only.

## Token hotspots

_(none)_

<!-- mcp-vertex:end agent-md -->

