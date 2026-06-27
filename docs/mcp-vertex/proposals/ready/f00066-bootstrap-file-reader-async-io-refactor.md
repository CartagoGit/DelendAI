---
id: f00066
status: done
type: proposal
track: core+refactor+async
date: 2026-06-25
kind: feat
title: Bootstrap file reader async I/O refactor (H5)
shipped-in: []
recan: []
related:
    - a00042 # audit that surfaced this finding (H5)
ownership:
    - { agent: implementation_runner, task: 'S1: rewrite existsSync and readFileSync to fs/promises async calls in packages/core/src/lib/bootstrap/bootstrap-tool.ts (H5)' }
globalGate: validate
acceptance:
    - { command: bun run typecheck, expect: exit0 }
    - { command: bun run test,      expect: exit0 }
    - { command: bun run validate,  expect: exit0 }
---

# f00066 — Bootstrap file reader async I/O refactor (H5)

## goal

Close audit `a00042` finding **H5** (sync I/O in bootstrap-tool) by refactoring `createWorkspaceFileReader` in [`packages/core/src/lib/bootstrap/bootstrap-tool.ts`](packages/core/src/lib/bootstrap/bootstrap-tool.ts) to use fully asynchronous filesystem primitives instead of synchronous ones.

## why

`a00042` walked the core engine bootstrap surface and found:
- **H5** — [`createWorkspaceFileReader`](packages/core/src/lib/bootstrap/bootstrap-tool.ts#L47-L52) implements synchronous `readFileSync` and `existsSync` calls internally under an `async` function signature.
Although this runs during the initialization/diagnostics phase (a boot-time exception), it is a best-practice violation of the core platform's non-blocking I/O principles, especially since the interface is already async-friendly.

## why this design

Replacing `existsSync` with `fs.promises.stat` or catching `ENOENT` from `fs.promises.readFile` ensures that the node/bun event loop is not blocked during execution. We can import `readFile` and `stat` from `node:fs/promises` and keep the reader fully async.

## non-goals

- Refactoring bootstrap commands that run inside shell executors where sync operations are unavoidable due to external tool limitations.

## architecture

```
packages/core/src/lib/bootstrap/
  bootstrap-tool.ts                 # MODIFY: replace readFileSync/existsSync with fs/promises calls
```

## slices

### S1 — async I/O in createWorkspaceFileReader (closes H5)

- **Files**: `packages/core/src/lib/bootstrap/bootstrap-tool.ts`
- **Status**: ready
- **Gate**: bun run validate
- **Acceptance**:
  - `grep -RInE '(readFileSync|existsSync)' packages/core/src/lib/bootstrap/` returns 0 hits except in comments.
  - The test suite passes with `bun run test`.

## acceptance

`bun run validate` exits 0.
