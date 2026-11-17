---
id: x01035
title: "Every CLI command pays about 1 s before it starts: a server child and an eager command registry"
kind: fix
status: ready
type: proposal
track: general
date: 2026-11-05
---

# x01035 — Every CLI command pays about 1 s before it starts: a server child and an eager command registry

## goal

A `work` subcommand runs in the CLI process without starting the `__serve` server child, and the CLI loads only the command it runs, so `delendai --version` and `delendai work status` cost close to their own work.

## why

Measured 2026-11-05 on a one-commit fixture (bare origin, `shared-checkout-merge` on main), three runs each, under load: `delendai --version` 493-518 ms; `delendai work status` 891-1418 ms; the same `runWorkUnit(['status'])` called in process 185-214 ms in all (import 104-124 ms, run 68-87 ms). Bare `bun -e 1` is 5 ms; importing `packages/cli/src/commands/registry` alone takes 503 ms, `@delendai/core/cli` 246 ms, `@delendai/core/public` 228 ms, `lib/stdio-context.factory` 258 ms. Every command that is not offline starts a `__serve` MCP server child (packages/cli/src/index.ts, `createStdioContext`) although the work engine runs in the CLI process: strace -ff by parent process shows the child spawning 52 (status, enter) to 92 (checkpoint) git processes against 9-43 in the command itself, and fetching on its own. The child's startup reconciliation also races the command: three times on 2026-11-04/05 `work publish` reported `NOT published ... does not exist` (exit 4) while the pull request had been opened (PRs #1793, #1803, #1804), once a publish was refused because another session's `__serve` process held the unit's ref, and a freshly entered create unit with no commit vanished, worktree and ref, within a minute. Only `work deliver`'s proposal transitions need the server today.

## non-goals

- Changing what any work subcommand does, prints or exits with.
- Removing the server child from commands that call MCP tools; they keep it.
- The git spawns of the work engine itself: x01034 bounds them.

## slices

- global_gate: type

### S1 — Work subcommands start no server child
- **Status**: pending
- **Files**: `packages/cli/src/index.ts`, `packages/cli/src/contracts/interfaces/cli-command.interface.ts`, `packages/cli/src/commands/groups/core.ts`, `packages/cli/src/commands/work.command.ts`, `packages/cli/src/commands/work.command.spec.ts`
- **Gate**: type
- acceptance:
  - "`offline` may be a predicate of the command's arguments; `work` is offline for every subcommand except `deliver`, which keeps the server for its proposal transitions."
  - "On the fixture, `delendai work status`, `enter`, `checkpoint`, `swarm`, `prove`, `publish` and `retire` start no `__serve` process (strace -ff), and their git processes are those of the command alone."
  - "work.command.spec.ts proves the work command declares itself offline except for deliver."

### S2 — The CLI loads only the command it runs
- **Status**: pending
- **DependsOn**: [S1]
- **Files**: `packages/cli/src/commands/registry.ts`, `packages/cli/src/commands/registry.spec.ts`
- **Gate**: type
- acceptance:
  - "The registry names every command and its help summary without importing the command's module; a command's module is imported when it runs (as `lazyWorkCommand` already does)."
  - "Importing the registry takes at most 60 ms on the fixture machine (today 503 ms), and `delendai --version` at most 150 ms (today 493-518 ms)."
  - "`delendai work status` on the fixture takes at most 400 ms (today 891-1418 ms), measured untraced over three runs."

## acceptance

- `offline` may be a predicate of the command's arguments; `work` is offline for every subcommand except `deliver`, which keeps the server for its proposal transitions.
- On the fixture, `delendai work status`, `enter`, `checkpoint`, `swarm`, `prove`, `publish` and `retire` start no `__serve` process (strace -ff), and their git processes are those of the command alone.
- work.command.spec.ts proves the work command declares itself offline except for deliver.
- The registry names every command and its help summary without importing the command's module; a command's module is imported when it runs (as `lazyWorkCommand` already does).
- Importing the registry takes at most 60 ms on the fixture machine (today 503 ms), and `delendai --version` at most 150 ms (today 493-518 ms).
- `delendai work status` on the fixture takes at most 400 ms (today 891-1418 ms), measured untraced over three runs.
