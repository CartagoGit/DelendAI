---
id: x00720
title: "A routed call takes the arguments a host sends"
kind: fix
status: review
type: proposal
track: hosts
date: 2026-09-28
priority: P1
related: [x00717]
last-transition-id: 438aff40-59d5-43e6-8730-cc02334e9c02
last-correlation-id: 438aff40-59d5-43e6-8730-cc02334e9c02
last-transition-from: in-progress
---

# x00720 — A routed call takes the arguments a host sends

## goal

A tool reached through `resolve_capability` or `compact_router` accepts
`"50"` for a number, `"true"` for a boolean, and JSON text for an array or
an object, whatever host sent it. Its own schema still decides what is
valid.

## why

The routers take a tool's arguments as a free-form record, so a host has
no schema to follow for them, and some hosts send every value as text.
On 2026-09-28 a reviewer on another host called `review_queue` with
`{ "limit": "50" }` and `{ "detail": "true" }`. The schema refused both,
and the reviewer fell back to the CLI and went on with a stale view of
the queue.

## why this design

- **At the one place routed arguments are validated.**
  `safeParseSurfaceArgs` serves both routers. A tool registered directly
  is validated by the host against its published schema, and a CLI
  command parses its own flags.
- **The schema decides.** Only a field the schema rejected as the wrong
  type, arriving as text, is converted, and only to the type the schema
  expected. The result is parsed again, so its limits still apply
  (`"500"` over a maximum of 50 is still refused). A string field stays a
  string. The caller's object is not changed.

## non-goals

- Converting arguments for directly registered tools.

## architecture

- `packages/core/src/lib/project/tool-surface-runtime.helper.ts`.

## Slices

- global_gate: none

### S1 — Text read as the type the schema expected

- **Status**: review
- **Gate**: `npx vitest run packages/core/tests/src/lib/project/tool-surface-runtime.args.spec.ts`
- **Files**:
  - `packages/core/src/lib/project/tool-surface-runtime.helper.ts`
  - `packages/core/tests/src/lib/project/tool-surface-runtime.args.spec.ts`

## dependency graph

None.

## acceptance

- A routed `review_queue { limit: "50", detail: "true" }` runs as
  `{ limit: 50, detail: true }`.
- `{ limit: "500" }`, `{ limit: "fifty" }` and `{ detail: "yes" }` are still
  refused.
