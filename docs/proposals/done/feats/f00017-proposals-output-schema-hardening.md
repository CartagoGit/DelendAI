---
id: f00017
status: done
type: proposal
track: proposals+tooling
date: 2026-06-21
closed: 2026-06-21
kind: feat
title: Harden remaining proposals output schemas
---

# f00017 — Harden remaining proposals output schemas

## Goal

Replace the remaining permissive `z.object({}).catchall(z.unknown())`
output schemas in `plugins/proposals` with explicit, protocol-tested
contracts where the tool output is stable enough to describe.

## Why

The protocol e2e suite now catches schema drift for `auto_work` and
`round_context`, and their generated SDK types are useful instead of
`Record<string, unknown>`. The same hardening should continue across
the proposals plugin, but several remaining tools multiplex actions or
return legacy recovery branches, so doing all of them in one incidental
cleanup would be too broad.

## Non-goals

- Redesigning tool behavior or changing persisted state formats.
- Removing intentionally permissive schemas before each action branch
  has a stable output contract.
- Moving proposal lifecycle logic out of the existing tools.

## Slices

### S1 — Continue-proposal schema
  - **Status**: done
  - **Files**: `plugins/proposals/src/lib/tools/continue-proposal.tool.ts`, `plugins/proposals/src/generated/tool-outputs.ts`, `packages/core/tests/src/lib/e2e/outputschema.e2e.spec.ts`
  - **Command**: `bunx vitest run packages/core/tests/src/lib/e2e/outputschema.e2e.spec.ts plugins/proposals/tests/src/lib/continue-proposal.spec.ts`
  - **Expect**: pass
  - **Notes**: Model the `auto`, `plan`, and `claim` success shapes with an MCP-compatible object schema; avoid `z.union` at the `registerTool` boundary because the current SDK path drops it from `listTools`.

### S2 — Transition and state tools schemas
  - **Status**: done
  - **Files**: `plugins/proposals/src/lib/tools/proposal-transition.tool.ts`, `plugins/proposals/src/lib/tools/state-tools.tool.ts`, `plugins/proposals/src/generated/tool-outputs.ts`
  - **Command**: `bunx vitest run plugins/proposals/tests/src/lib`
  - **Expect**: pass
  - **Depends-on**: S1
  - **Notes**: Keep legacy/f00016 transition branches explicit enough for generated SDK users while preserving old proposal compatibility.

### S3 — Coordination tools schemas
  - **Status**: done
  - **Files**: `plugins/proposals/src/lib/tools/agent-lock.tool.ts`, `plugins/proposals/src/lib/tools/task-queue.tool.ts`, `plugins/proposals/src/lib/tools/agent-names.tool.ts`, `plugins/proposals/src/generated/tool-outputs.ts`
  - **Command**: `bunx vitest run plugins/proposals/tests/src/lib/agent-lock-contention.spec.ts plugins/proposals/tests/src/lib/agent-names.spec.ts`
  - **Expect**: pass
  - **Depends-on**: S2
  - **Notes**: These are action-multiplexed, so prefer shared sub-schemas plus a broad-but-typed envelope over one giant brittle object.

### S4 — Recovery and worktree schemas
  - **Status**: done
  - **Files**: `plugins/proposals/src/lib/tools/recovery-tools.ts`, `plugins/proposals/src/lib/tools/agent-worktree.tool.ts`, `plugins/proposals/src/generated/tool-outputs.ts`
  - **Command**: `bunx vitest run plugins/proposals/tests/src/lib`
  - **Expect**: pass
  - **Depends-on**: S3
  - **Notes**: Recovery tools should expose enough structure for UIs and agents to tell repair plans, stale locks, and destructive actions apart.

## Acceptance

- [x] Remaining catchall output schemas in `plugins/proposals/src/lib/tools` are either replaced with explicit schemas or documented inline as intentional action-multiplexed exceptions.
- [x] `bun run types:generate` updates generated SDK output types.
- [x] The real protocol e2e covers every newly tightened read-only output path.
- [x] `bun run validate` is green.
