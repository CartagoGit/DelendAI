---
id: x00612
title: "The shipped CLI cannot start its own server"
kind: fix
status: review
type: proposal
track: trust
date: 2026-09-23
shipped-in: ["dea43b3d7"]
---

# x00612 — The shipped CLI cannot start its own server

## goal

Run the **built** CLI in a project that is not this repository and every
command that needs a server answers `Connection closed`. The spawn is
looking for files that only exist in our development layout. A published
binary must be able to start the server it ships with, in anybody's
checkout.

## why

Driven against a throwaway consumer project — branch `trunk`, profile
`worktree-pr` — with a **valid** configuration, so nothing else was in the
way:

```
$ delendai work status
Failed to connect to MCP server: McpError: MCP error -32000: Connection closed
```

`resolveServerEntrypoint` tried four paths, in order. From the built
bundle, in that project, here is each one:

| rung | path | on disk |
| --- | --- | --- |
| 1 | `$DELENDAI_SERVER_BIN` | unset |
| 2 | `<cwd>/packages/cli/src/index.ts` | **missing** |
| 3 | `<this module>/../index.ts` | **missing** |
| 4 | `<this module>/../../dist/index.js` | **missing** |
| fallback | `<cwd>/packages/cli/dist/index.js` | **missing** |

Every rung describes the development layout: a `packages/cli` beside the
caller, or a `dist` two levels up from a source file. The shipped bundle
has neither, and a consumer's checkout has neither. So the ladder could
only ever succeed inside this repository — which is exactly where it was
written and tested.

The same probe surfaced a second, smaller leak. `delendai doctor` spawned
`test -e` and `ls -1` per check with stderr inherited, so a project
without our layout got

```
ls: cannot access 'plugins': No such file or directory
```

four times before its health score. The code already treats a missing
directory as an answer — `listDirs` returns `[]` — so not one of those
lines was a finding. They were a shell talking over the report.

## why this design

**The server is the binary already running.** `__serve` is handled by this
same entrypoint (`runEntry`), in both layouts: from source `process.argv[1]`
is `packages/cli/src/index.ts`; installed, it is the published bundle. So
there is nothing to search for, and four guesses that could each be wrong
somewhere collapse into one statement that cannot be wrong anywhere.

**A guess that fails must refuse, not guess again.** When the process does
not expose its own entrypoint, the answer is a refusal naming
`DELENDAI_SERVER_BIN` — an explicit answer from the host beats another
inference. Adding a fifth rung was the alternative, and a fifth rung is
how there came to be four.

**One answer to "is it there".** The doctor now asks `safePathExists` and
`safeListDirNames`, this repository's existing helpers, rather than
shelling out. `test -e` answers for a directory as well as a file and
`Bun.file(...).exists()` does not, which is a difference measured, not
assumed: swapping in the wrong primitive took the health score from 20 to
0 before the stat-based helper restored it.

## non-goals

- Changing what `doctor` checks or how it scores.
- Removing `DELENDAI_SERVER_BIN`. It is the deliberate override and stays.

## Slices

### S1 — The server is the binary already running

- **Status**: done — verified with the BUILT bundle in the consumer
  project: `work status` went from `Connection closed` to reporting that
  project's own `trunk` and `worktree-pr`.
- **Gate**: `npx vitest run packages/cli/src/lib/stdio-context.factory.spec.ts`
- **Files**: `packages/cli/src/lib/stdio-context.factory.ts`,
  `packages/cli/src/lib/stdio-context.factory.spec.ts`
- The entrypoint is `process.argv[1]` unless `DELENDAI_SERVER_BIN` says
  otherwise; a process that exposes no entrypoint gets a refusal naming
  the override, not another guess.

### S2 — The doctor asks the filesystem, not a shell

- **Status**: done — the four `ls:` lines are gone and the score is
  unchanged at 20/100 warn, which is the point: the noise went and the
  verdict did not.
- **Gate**: `npx vitest run packages/cli/src/lib/doctor`
- **Files**: `packages/cli/src/lib/doctor/runner.ts`
- `fileExists` and `listDirs` use `safePathExists` and
  `safeListDirNames`; no child process, no inherited stderr, and a
  missing directory is an answer rather than a line in somebody's
  terminal.

## acceptance

With the built CLI, in a consumer project on `trunk` with `worktree-pr`:

- `delendai work status` answers, reporting *that* project's profile and
  branch;
- `delendai doctor` runs and prints no `ls:` line;
- the health score is the same as the shelled implementation produced
  (20/100 warn), so the noise went and the verdict did not change.
