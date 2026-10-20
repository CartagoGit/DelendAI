---
id: f00774
title: "A delegated hop carries only the tools its task may use"
kind: feat
status: in-progress
type: proposal
track: architecture
date: 2026-10-20
related:
  - q00034
  - f00772
---

# f00774 — A delegated hop carries only the tools its task may use

## goal

When a hop names the tools its task may use (`toolsAllow`, from the delegation manifest's `allowedTools`), the runner tells a known client in that client's own flags. The hop then carries no skills, and no MCP servers unless one of its tools is an MCP tool. A client that cannot be scoped is told nothing it would reject.

## why

The owner, 2026-10-19: subagents do not share context, so each one starts by paying for its whole base context; the fix should be engineering (just enough context), not prompts.

Measured on 2026-10-20 with Claude Code 2.1.270 and Haiku, `-p` with a one-word answer, in an empty folder (cache-creation tokens):

| Hop | tokens | cost |
|---|---|---|
| everything loaded (default) | 25,801 | $0.104 |
| no tools | 8,831 | $0.024 |
| `--tools Read,Edit` + no skills + no MCP | 10,695 | $0.044 |
| `Read,Edit,Write,Grep,Glob` | 12,847 | $0.052 |
| the same, plus `Bash` | 17,083 | $0.069 |
| the scoped hop again (identical context) | 10,695 cache *reads* | $0.003 |

The same one-word hop in this repository, with its CLAUDE.md, MCP server and memory, cost 37,065. Scoping a Read/Edit worker cuts what it pays per hop by more than half. Its context is also identical from hop to hop, so later hops read it from cache.

Three defects stood in the way:

- `buildCliArgs` appended `--allowedTools` to every CLI. Codex and OpenCode do not have that flag, so a scoped hop on them failed.
- A hop that ended with no exit code resolved as a success with an empty answer. Once the spawner reports a command that cannot start as an exit with no code (f00773), that would have read a missing CLI as a hop that worked.
- On Claude Code, `--allowedTools` only pre-approves tools. Every tool's definition stayed in the context. `--tools` is what removes them.

## non-goals

- Choosing the tools. The manifest's `allowedTools` already comes from the role profiles (`agentToolProfile`).
- The per-model byte budget and recording pack size in the outcome store (q00034 S5's second half).

## slices

- global_gate: type

### S1 — Scope in the client's own flags

- **Status**: in-progress
- **Files**: `packages/core/src/lib/contracts/interfaces/known-client.interface.ts`, `packages/core/src/lib/contracts/constants/known-clients.constant.ts`, `plugins/orchestrator-runner/src/lib/subprocess/cli.ts`, `plugins/orchestrator-runner/tests/src/lib/subprocess/cli-tool-scope.spec.ts`, `plugins/orchestrator-runner/tests/src/lib/subprocess/cli.spec.ts`
- **Gate**: type
- acceptance:
  - "`IKnownClient` declares `toolScope` (`restrict`, `approve`), `scopedHopArgs`, `noMcpArgs` and `mcpToolPrefix`."
  - "Claude Code's entry declares `--tools`, `--allowedTools`, `--disable-slash-commands`, `--strict-mcp-config` and `mcp__`."
  - "`buildCliArgs` adds nothing to a hop with no `toolsAllow`. A known client with `toolScope` gets `restrict`, then `approve`, then `scopedHopArgs`, then `noMcpArgs` unless a tool starts with `mcpToolPrefix`. A known client without `toolScope` gets nothing. An unknown command keeps `--allowedTools`."

  - "A CLI hop that ends without an exit code fails instead of resolving an empty answer as a success. That is a process that never started (not installed) or that a signal ended. A cancelled one still reports `invocation-cancelled`."

## acceptance

- The S1 specs pass.
- The exact argv for `Read,Edit` runs on the real Claude Code. Done 2026-10-20: it answered, with 10,695 tokens of context.
