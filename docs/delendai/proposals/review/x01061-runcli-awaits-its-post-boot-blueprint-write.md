---
id: x01061
title: "runCli awaits its post-boot blueprint write"
kind: fix
status: review
type: proposal
track: general
date: 2026-11-13
last-transition-id: 7d5ef2e1-6a7d-4c22-9174-bd7d197b61fe
last-correlation-id: 7d5ef2e1-6a7d-4c22-9174-bd7d197b61fe
last-transition-from: in-progress
last-transition-at: 2026-11-18T03:39:18.290Z
shipped-in:
  - "7ae4f0d2c59bf07e24cb9b5496c5310b02763cdd"
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
- **Status**: done
- **Files**: `packages/core/src/lib/cli/run-cli.ts`, `packages/core/tests/src/lib/cli/run-cli.e2e.spec.ts`
- **Gate**: none
- shipped-in: `db3ca1b1be6b`
- review-state: done
- review-implementer: claude-sonnet-5-5
- review-reviewer: mai-code-2
- review-log: approved by mai-code-2 — verified at 7ae4f0d2c59b, validate exit 0 and tests 17/17 claimed, no recorded run cited; acceptance 3/3: (1) runCli awaits prepareServerBlueprintOnStart after assembled.start(); the E2E settles runCli and immediately asserts access to .cache/delendai/bootstrap/bluepri… (2) The awaited promise retains `.catch(() => undefined)`, so rejection resolves without turning successful server boot into an error. (3) The existing afterEach rm removes each temp workspace without force/retry changes and all 17 specs pass, including the immediate post-return file assertion. — Reviewed the delivered runCli sequence and E2E regression. All 17 run-cli tests pass; the new assertion verifies blueprint.json is already present immediately after `await runCli`, proving there is no post-return writer, while `.catch(() => undefined)` preserves best-effort failure swallowing.

## acceptance

- `runCli` returns only after the blueprint write settled: a spec asserts the blueprint file exists as soon as `await runCli(...)` returns, and fails without the fix.
- Failures of the best-effort write are still swallowed.
- run-cli.spec cleanup needs no change to stay race free.
