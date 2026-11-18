---
id: x01061
title: "runCli awaits its post-boot blueprint write"
kind: fix
status: ready
type: proposal
track: general
date: 2026-11-13
---

# x01061 — runCli awaits its post-boot blueprint write

## goal

`runCli` resolves only after the server blueprint it starts after boot has settled, so whoever awaits `runCli` (the bin, a spec, an embedder) never races a writer still creating files under the cache directory.

## why

`run-cli.spec` fails intermittently under load with ENOTEMPTY on removing its temp workspace. Cause: after `start()`, `runCli` launches `prepareServerBlueprintOnStart` as a fire-and-forget promise (`void ...`). `runCli` returns while that promise is still analysing the project and creating `bootstrap/` under the cache directory, so the spec's recursive `rm` of the workspace walks a directory the writer is still filling: a file appears after the listing and the final `rmdir` fails with ENOTEMPTY. Alone it passes because the writer usually finishes first. The server is already live when the write runs, so awaiting it delays no MCP response.

## non-goals

- No retries, `force`, `maxRetries`, sleeps or longer timeouts in the spec.
- No change to what the blueprint contains or when it is written.

## slices

- global_gate: none

### S1 — await the blueprint write at the end of runCli
- **Status**: pending
- **Files**: `packages/core/src/lib/cli/run-cli.ts`, `packages/core/tests/src/lib/cli/run-cli.spec.ts`
- **Gate**: none

## acceptance

- `runCli` returns only after the blueprint write settled: a spec asserts the blueprint file exists as soon as `await runCli(...)` returns, and fails without the fix.
- Failures of the best-effort write are still swallowed.
- run-cli.spec cleanup needs no change to stay race free.
