---
id: c00511
title: "Wire `withErrorCollection` into the tool registration pipeline (or remove the unused API)"
kind: chore
status: ready
type: proposal
track: observability
date: 2026-09-06
priority: P1
related:
    - c00510 # the parent hardening round
    - x00079 # audit / x00079 S7 — the original "delivery-verifier.ts:160" cleanup
---

# c00511 — Wire `withErrorCollection` into the tool registration pipeline (or remove the unused API)

## Goal

`withErrorCollection` (in
`packages/core/src/lib/error-collection/with-error-collection.ts`)
defines a wrapper that tool handlers SHOULD compose around their
business logic so every plugin's error path automatically feeds into
the `IErrorSink` port. The API is documented, the skill is documented,
the wrapper compiles and its spec is green. **Zero plugins actually
use it.** A repo-wide grep returns only the definition + the skill +
the spec.

The audit of 2026-09-06 (H3 / H7 in the cross-cutting report) flagged
this as P1: the error-collector port is a contract without
consumers. Every plugin that should write to `logs` / `issues`
instead writes to `console.warn` or surfaces its failure through a
plugin-specific path.

This proposal has two equally valid outcomes:

- **(preferred)** auto-wire `withErrorCollection` into every tool
  registration so a single decorator in
  `buildToolRegistration` calls the wrapper with the registered
  handler, the resolved `IErrorSink` from `ctx`, and the tool's
  `id` for breadcrumb context.
- **(acceptable)** delete the API and update the skill to
  document the actual sink-direct path (`ctx.logs.log` /
  `ctx.issues.report`) that every plugin should use directly.

## why

Without a single sink port that every plugin uses, the centralised
incident stream is empty in practice. The audit confirmed that 54 of
56 plugins ignore `IErrorSink` entirely. The
`withErrorCollection` wrapper is the documented entry point, so its
absence means the contract is documented-but-unimplemented — the
worst of both worlds for a system that claims fan-out observability.

## why this design

Auto-wiring preserves the "single decorator" pattern that the rest
of the codebase already uses (`withFileMutex` for durability,
`redactSecrets` for redaction, `writeFileAtomic` for atomicity). The
alternative (every plugin manually wrapping its handler) requires
edits to 50+ handler functions, which the cascade cannot do in a
single atomic slice.

## Tasks

### S1 — Audit current consumers

Survey every tool handler in `plugins/*/src/lib/tools/` for:

1. Direct `ctx.logs.log(...)` calls (these are the closest thing to
   a working sink today).
2. Direct `console.warn` / `console.error` calls.
3. Plugin-local `try/catch` blocks that swallow errors silently.

The output of S1 is a list of every plugin's current error path so
S2's auto-wiring knows what NOT to double-log.

### S2 — Auto-wire (preferred path)

In `buildToolRegistration` (or its composition root in
`packages/core/src/lib/plugins/load-plugins.ts`), wrap the registered
handler with `withErrorCollection(handler, {
  errorSink: ctx.errorSink,
  breadcrumbs: { toolId, namespacePrefix },
})`. The wrapper must:

- Pass `ok` / `idle` results through unchanged.
- Capture thrown errors, classify them via the existing
  `classifyCapturedError`, and emit them to the sink with the
  tool id as breadcrumb.
- Never swallow a rejection — it re-throws after the sink call so
  the MCP transport still sees the error.

### S3 — Acceptable fallback (if S2 is too invasive)

If auto-wiring proves infeasible (e.g. some tool handlers have
control flow that depends on uncaught-throw semantics), delete
`with-error-collection.ts` and update:

- The skill `packages/core/skills/error-collection/SKILL.md` to
  document the `ctx.logs.log({ severity, incidentType, message,
  context })` direct path that plugins should use.
- The `@delendai/rules` adapter that wires language-specific
  exception classes to the sink.

### S4 — Coverage lint

Add a script `tools/scripts/lint/tool-handlers-emit-errors.script.ts`
that walks `plugins/*/src/lib/tools/*.tool.ts` and flags:

- Handlers that catch an error without re-throwing AND without
  emitting a `ctx.logs.log` / `ctx.errorSink.emit` call.
- Handlers that emit `console.warn` / `console.error` instead of
  the structured sink.

This is the gate that closes the regression class once the wiring lands.

## Acceptance

- `withErrorCollection` is either auto-wired (S2) or removed (S3).
- Every tool handler in `plugins/*/src/lib/tools/` either delegates
  to the wrapper (preferred) or uses the documented
  `ctx.logs.log({ ... })` direct path.
- The new lint exits 0 on the existing surface.
- `bun run validate` stays green.

## Out of scope

- Migrating existing plugin-local `try/catch` blocks to use the
  sink. That's a per-plugin cleanup that the cascade handles after
  this proposal lands.
- The `incident-error` LogEventKind — see c00512.