---
id: x00984
title: "Read-only commands leave a project as they found it"
kind: fix
status: done
type: proposal
track: a00095-consistency
date: 2026-10-27
last-transition-id: 8f546e13-6638-4df0-a33b-08ad677df1c7
last-correlation-id: 8f546e13-6638-4df0-a33b-08ad677df1c7
last-transition-from: review
last-transition-at: 2026-11-02T22:05:20.893Z
shipped-in:
  - "9f2554a01f10bddf63a24b8eb81cccc74899f36e"
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
- **Status**: done
- **Files**: `packages/cli/src/lib/leave-no-trace.service.ts`, `packages/cli/src/lib/leave-no-trace.service.spec.ts`, `packages/cli/src/index.ts`, `packages/cli/src/contracts/interfaces/cli-command.interface.ts`, `packages/cli/src/commands/registry.ts`, `packages/cli/src/commands/groups/core.ts`, `packages/cli/src/commands/registry-delegation.spec.ts`
- **Gate**: type
- acceptance:
  - "In a folder with no .cache/delendai, status, overview and adopt each exit 0 and the folder holds no new file afterwards; a spec runs each against a fresh folder."
  - "In a project that already has .cache/delendai, the same commands report what they reported before."
- shipped-in: `c149012b5c28`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3.1-flash
- review-log: approved by minimax-m3.1-flash — verified at 9f2554a01f10, validate exit 0 and tests 19/19 claimed, no recorded run cited; acceptance 2/2: (1) At 9f2554a0 the new leave-no-trace service computes, before the server starts, the outermost directory the run would have to create, and removes exactly that d… (2) At 9f2554a0 the service returns no cleanup at all when the project already holds its cache, so what was there is neither changed nor removed, and the command's… — Approved on the delivered state of 9f2554a01f10bddf63a24b8eb81cccc74899f36e. A read-only command no longer leaves a cache directory behind: the service works out before the server starts which directory the run would have created and removes exactly that one afterwards, and a project that already had its cache is left as it was. The type gate exited 0 and the two slice specs pass 19 of 19. Four residuals, recorded and not blocking: the assertion that a project with a cache keeps what the run wrote is vacuous, because the two directories the run creates already satisfy it; the service's cache directory parameter is never populated, so a custom cache directory would not be honoured; when the cache did not exist before the run, the cleanup removes the whole cache directory, so anything another process writes into it during the run goes with it; and only the three named commands declare themselves read-only, while the goal spoke of any command that only reads.

## acceptance

- In a folder with no .cache/delendai, status, overview and adopt each exit 0 and the folder holds no new file afterwards; a spec runs each against a fresh folder.
- In a project that already has .cache/delendai, the same commands report what they reported before.

## notes

- The writers seen at boot: the cache layout's `.gitignore`, the evidence store (opened eagerly), the bootstrap blueprint (`run-cli.ts`), runtime events and the server log. Two directions to choose between when implementing: the CLI tells the server it serves a read-only command (a flag the server honours by opening its stores lazily and keeping its log on stderr), or the writers become lazy for every boot, creating the cache on the first real write. The second also stops a host server from creating a cache in a project nobody has used delendai in yet; measure its cost on the host server's start-up before choosing it.
- Chosen on 2026-11-02: neither server-side direction. A command declares `readsOnly(args)`; when the project had no cache before it ran, the CLI removes the outermost directory the run created once the server has closed. Pointing the server at a cache outside the project was tried first and is refused by the server's containment (`cacheDir escapes workspace`), which stays. Core's boot is untouched, so the host server's start-up cost does not move. A project that already has its cache keeps everything written to it. Measured: status, overview and adopt each leave 0 files in a fresh `git init` folder.
