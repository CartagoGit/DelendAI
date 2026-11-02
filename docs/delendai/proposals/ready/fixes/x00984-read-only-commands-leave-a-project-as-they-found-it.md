---
id: x00984
title: "Read-only commands leave a project as they found it"
kind: fix
status: ready
type: proposal
track: a00095-consistency
date: 2026-10-27
---

# x00984 — Read-only commands leave a project as they found it

## goal

`delendai status`, `delendai overview` and `delendai adopt` (and any other command that only reads) leave a project's tree exactly as they found it: in a project with no `.cache/delendai/`, none is created.

## why

Joint audit a00095, G124, cut from x00971 S3 on 2026-10-27. Reproduced that day: in an empty `git init` folder, each of `status`, `overview` and `adopt`, run alone, created `.cache/delendai/` holding `.gitignore`, `evidence.sqlite` with its `-shm`/`-wal` files, `bootstrap/blueprint.json`, `runtime/events.jsonl` and `logs/mcp-server/mcp-server.<date>.log`.

The cause is structural: every CLI command reaches its tool through a full delendai server it starts over stdio (`packages/cli/src/lib/stdio-context.factory.ts`), and that server's boot writes its cache before any tool is called, whether or not the command writes anything. A person who runs `delendai status` to see whether delendai is set up in a project finds that asking set it up.

## non-goals

- Commands that write (`init`, `work`, proposal transitions) keep creating what they need.
- A project that already has `.cache/delendai/` may have it touched as it is today (logs, events); only creating it from nothing is in scope.

## slices

- global_gate: type

### S1 — A server started for a read-only command writes nothing until something is written
- **Status**: pending
- **Files**: `packages/cli/src/lib/stdio-context.factory.ts`, `packages/cli/src/commands/registry.ts`, `packages/core/src/lib/cli/assemble.ts`, `packages/core/src/lib/cli/run-cli.ts`, `packages/core/src/lib/cache/cache-layout-bootstrap.ts`, `packages/core/src/lib/evidence/evidence-store.facade.ts`, `packages/core/src/lib/observability/runtime-events.ts`, `packages/core/src/lib/shared/server-log.ts`
- **Gate**: type
- acceptance:
  - "In a folder with no .cache/delendai, status, overview and adopt each exit 0 and the folder holds no new file afterwards; a spec runs each against a fresh folder."
  - "In a project that already has .cache/delendai, the same commands report what they reported before."

## acceptance

- In a folder with no .cache/delendai, status, overview and adopt each exit 0 and the folder holds no new file afterwards; a spec runs each against a fresh folder.
- In a project that already has .cache/delendai, the same commands report what they reported before.

## notes

- The writers seen at boot: the cache layout's `.gitignore`, the evidence store (opened eagerly), the bootstrap blueprint (`run-cli.ts`), runtime events and the server log. Two directions to choose between when implementing: the CLI tells the server it serves a read-only command (a flag the server honours by opening its stores lazily and keeping its log on stderr), or the writers become lazy for every boot, creating the cache on the first real write. The second also stops a host server from creating a cache in a project nobody has used delendai in yet; measure its cost on the host server's start-up before choosing it.
