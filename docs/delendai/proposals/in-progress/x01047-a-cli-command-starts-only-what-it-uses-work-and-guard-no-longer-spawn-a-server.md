---
id: x01047
title: "A CLI command starts only what it uses: work and guard no longer spawn a server"
kind: fix
status: in-progress
type: proposal
track: general
date: 2026-11-08
last-transition-id: 9f4a4dcf-4d2a-4771-8c2a-5a0de14294cb
last-correlation-id: 9f4a4dcf-4d2a-4771-8c2a-5a0de14294cb
last-transition-from: ready
last-transition-at: 2026-11-08T01:07:34.155Z
---

# x01047 — A CLI command starts only what it uses: work and guard no longer spawn a server

## goal

Measured on a fixture repo, delendai work status takes 3.3 s against 0.5 s for --version, and the CPU profile shows 3.7 s of it idle waiting for a spawned MCP server that work status never calls (runWorkUnit makes no tool request); guard is already offline at 0.35 s, and the registry import adds 0.28 s over the 0.27 s core import to every command. A command spawns the MCP server only when it first calls a tool, and work, guard and proposals load their own command module instead of the registry of every command. A startup budget spec per command family fails when the import graph or the server spawn comes back.

## why

Every CLI command pays for what only some use. On a fixture repo `work status` took 1.4 to 3.3 s against 0.5 s for `--version`, and the CPU profile (bun --cpu-prof) shows 3.7 s of it idle waiting for an MCP server the command never called; `guard` was already offline at 0.57 s, and loading the registry of every command adds 0.28 s over the 0.27 s the core costs. Hooks and agents run these commands all day, so the cost is paid thousands of times.

## non-goals

- `proposals` commands still call tools, so they still start the server at their first call; running those tools in this process is a larger change and is left alone. Wall time is not asserted in a spec (noise on a shared machine): the budget is the import graph and the absence of the server client.

## slices

- global_gate: none

### S1 — Lazy server context, per-command loading and a startup budget spec
- **Status**: pending
- **Files**: `packages/cli/src/index.ts`, `packages/cli/src/lib/lazy-context.factory.ts`, `packages/cli/src/contracts/interfaces/lazy-context.interface.ts`, `packages/cli/src/lib/lazy-context.factory.spec.ts`, `packages/cli/src/lib/command-loader.service.ts`, `packages/cli/src/lib/command-loader.service.spec.ts`, `packages/cli/src/lib/startup-budget.spec.ts`
- **Gate**: type
- acceptance:
  - "delendai work status never spawns the MCP server: the server starts at the first tool call, not at command start"
  - "work, guard and proposals load their own command module and not the registry of every command"
  - "a spec bounds the static import graph of the work, guard and proposals entries and fails if the registry or a server spawn returns to them"

## acceptance

- delendai work status never spawns the MCP server: the server starts at the first tool call, not at command start
- work, guard and proposals load their own command module and not the registry of every command
- a spec bounds the static import graph of the work, guard and proposals entries and fails if the registry or a server spawn returns to them
