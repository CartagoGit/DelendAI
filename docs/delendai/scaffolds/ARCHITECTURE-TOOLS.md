---
applies-to: plugins/**/src/lib/tools/*.ts
---

# Architecture: tools

## Purpose

MCP tools expose a stable machine-readable surface. Tool handlers should be thin
adapters over tested engines.

## Required Shape

- Every public tool declares `outputSchema`.
- Inputs use Zod schemas at the registration boundary.
- Handlers return compact JSON via `toolJson`, `toolOk`, or `toolError`.
- Durable writes use `withFileMutex` and `writeFileAtomic`.
- Workspace paths are injected by plugin context, not guessed from `process.cwd()`.

## Validation

Run `bun run typecheck`, `bun run test`, and regenerate tool output types when
the public tool surface changes.

