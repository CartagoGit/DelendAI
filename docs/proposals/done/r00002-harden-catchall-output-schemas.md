---
id: r00002
status: done
type: proposal
track: plugins+core
date: 2026-06-21
kind: refactor
title: Harden the remaining permissive catchall outputSchemas
---

# r00001 — Harden the remaining permissive `catchall` outputSchemas

## Goal

Close the master audit's M24 *follow-up* (line 518) by replacing the
documented-exception `z.object({}).catchall(z.unknown())` `outputSchema`s
in `bootstrap`, `scaffold`, and the action-multiplexed `proposals_*` tools
with **explicit object schemas** wherever the SDK MCP allows it. Where it
does not, document the exact reason per call-site so the exception is
auditable.

## Why

- The 3rd-party agnostic audit (Codex GPT-5, 18-06) flagged this as the
  single remaining "permissive schema" hole after M24 was closed for the
  `rules` plugin.
- An `outputSchema` that admits any object is, in practice, the same as no
  schema: the SDK cannot validate `structuredContent`, downstream type
  generation collapses to `unknown`, and consumers fall back to duck-typing
  — exactly what M24 was created to prevent.
- The audit calls the current state a "documented exception, not
  bloqueante". This proposal makes the exception **explicit per call-site
  with rationale**, and eliminates it where the schema is in fact knowable.

## The honest constraint

The MCP SDK has a known limitation: tools that return **one of N
shapes** depending on an input discriminator (e.g. `proposals_create`
returns either `{ ok: true, proposal: {...} }` or
`{ ok: false, reason: '...' }`) cannot express the union at the type
level *and* keep the `outputSchema` strict. Workarounds:

- **Zod 3 discriminated unions** — supported by the SDK since 1.1.0; we
  already use Zod 3.23.x. The catch is that the SDK serialises the schema
  to JSON Schema, and JSON Schema's `oneOf` is not 1:1 with Zod's
  discriminated union when the discriminator is a string literal with
  extra properties. **Test first.**
- **Schema per "branch"** — split the tool into multiple tools
  (`proposals_create_ok` / `proposals_create_err`). Higher churn, but
  bullet-proof.
- **Tagged union with explicit discriminator** — `z.union([z.object({ ok:
  z.literal(true), ... }), z.object({ ok: z.literal(false), ... })])`
  serialises cleanly to JSON Schema `oneOf`. The discriminator must be
  documented as the *first* property for SDK clients.

The proposal tries (3) first and falls back to (2) only if (3) fails the
golden-schema test in S0.

## Non-goals

- Re-touching tools that already have explicit schemas (M24 already covered
  `rules`).
- Changing the response **content** of any tool (only the schema is
  tightened).
- Breaking the public tool surface (tool names stay identical).

## Slices

### S0 — Golden-schema baseline
  - **Status**: done
  - **Files**: `packages/core/tests/src/lib/tool-response.golden.spec.ts` (new
    — asserts the JSON Schema serialisation of the current `catchall`
    schemas and pins a `__strict__` goal schema per tool so a regression
    trips the test).
  - **Command**: `bunx vitest run packages/core/tests/src/lib/tool-response.golden`
  - **Expect**: pass on the current code; the `__strict__` block is `xfail`.

### S1 — `bootstrap` (2 tools)
  - **Status**: done
  - **Files**: `packages/core/src/lib/tools/bootstrap-tool.ts` (or equivalent
    location — confirm with the linter that no name drift), `packages/core/tests/...`
  - **Command**: `bunx vitest run packages/core && bun run typecheck`
  - **Expect**: green; `outputSchema` is now explicit; golden test moves
    from `xfail` to `pass` for this tool.

### S2 — `scaffold` (3 tools: list/apply/dry-run)
  - **Status**: done
  - **Files**: `packages/core/src/lib/cli/scaffold-tool.ts` and friends.
  - **Command**: `bun run typecheck && bunx vitest run packages/core`
  - **Expect**: green.

### S3 — `proposals` action-multiplexed tools
  - **Status**: done
  - **Files**: `plugins/proposals/src/lib/tools/*.tool.ts` (the ones that
    currently use `catchall` — enumerate via `rg "catchall" plugins/proposals`).
  - **Command**: `bun run validate`
  - **Expect**: green; every tool has an explicit union schema; SDK
    clients can narrow on the discriminator.

### S4 — Per-call-site exception audit
  - **Status**: done
  - **Files**: `docs/proposals/audits/a1-16-06-2026-…md` (line 518 → `[x]`
    with link to this proposal; if any `catchall` survives, it gets a
    per-call-site comment in the form
    `// schema exception: <SDK limitation> (<issue#>)` and the audit
    references each one by file:line).
  - **Command**: none.
  - **Expect**: master audit line 518 is now `[x]`.

## Acceptance

- [x] Zero `catchall(z.unknown())` in `src/` (verified by `rg`).
- [x] Golden test passes on every tool (no `xfail` left).
- [x] Type generation (`bun run types:generate`) produces typed
      `structuredContent` for every tool (no `Record<string, unknown>`).
- [x] Master audit line 518 is superseded by the later r00002/a00026 hardening
      trail.

## risks and mitigations

- **R1 — Discriminated union serialises incorrectly for a specific tool**:
  S3's plan is "enumerate first, then fix" so a single failing tool doesn't
  block the rest.
- **R2 — Existing consumers depend on the loose schema**: type generation
  is the contract; if a consumer was reading `Record<string, unknown>` they
  will get a compile error. This is **intentional** — the whole point of
  M24 was to make the surface typed. Documented in the changelog entry.

## notes

### Closure — 2026-06-21

Closed after the follow-up hardening work landed in `r00002` and the
core golden schema guard was repaired. Verification:

- `rg "catchall\\(z\\.unknown\\(\\)\\)" packages plugins apps tools` returns no
  production outputSchema matches.
- `bun run test packages/core/tests/src/lib/tool-response.golden.spec.ts`
  passes.
- The remaining productive catchall is the documented, typed
  `metrics.tools: z.object({}).catchall(MetricSchema)` exception, not
  `z.unknown()`.

- Master audit: `docs/proposals/audits/a1-16-06-2026- Auditoría Maestra (Unificada).md` (line 518).
- M24 guard test: `plugins/rules/tests/src/lib/plugin.spec.ts` (cited as
  the model for the new golden test).
- `toolJson` helper: `packages/core/src/lib/shared/tool-response.ts` (the
  caller side that the new schemas must continue to satisfy).
- `bun run types:generate`: regenerates the typed tool SDK from
  `outputSchema`s.
