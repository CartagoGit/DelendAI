---
id: x00107
title: "Every tool outputSchema accepts the canonical toolError envelope — convention + gate + fix the 8 offender files"
kind: fix
status: ready
type: proposal
track: tooling+gates
date: 2026-07-15
---

# x00107 — Every tool outputSchema accepts the canonical toolError envelope — convention + gate + fix the 8 offender files

## Goal

Make "the outputSchema models BOTH envelopes (toolOk and toolError)" an executable repo convention. x00105 fixed 3 instances the empty-input probe happened to hit, but the class is systemic: 8 more files declare `ok: z.literal(true)` (or required payload fields) while their handlers call toolError — and the 44 need-input tools never exercise their error path under the probe. New static check in verify:tools: for EVERY captured outputSchema, `schema.safeParse({ok:false, error:{reason:'probe'}})` must succeed; a red row names the tool. Then fix every offender (audit-consolidate, external-mcps catalog/status/suggest, git write-tools, memory tools, proposals authoring/adopt/inherit-host-instructions, status-marker close-tools, usage-tracking clear) and regen types.

## why

a00055 F-1. Evidence: grep cross-reference of `z.literal(true)` outputSchemas vs toolError callers in the same file yields 8 suspect files (plugins/git/src/lib/tools/write-tools.ts:305,335 with 11 toolError calls; plugins/memory/src/lib/tools/tools.ts:137,354,389,439 with 10; plugins/proposals/src/lib/tools/authoring.tool.ts:149,418 with 11; …). A schema-validating MCP host rejects these tools' honest error responses; the typed SDK asserts `ok: true` for calls that can fail. Same class as the x00105 finds (ack/correlate/close_plan), now closed generically.

## non-goals

- No behavioural changes to handlers — schemas widen to match reality; success payloads stay identical.
- Tools that genuinely never error still widen their schema (harmless, keeps the rule uniform and statically checkable).

## Slices

- global_gate: e2e

### S1 — Error-envelope acceptance probe in verify:tools (red first over the current tree)
- **Status**: pending
- **Files**: `tools/scripts/verify/verify-probes.ts`, `tools/scripts/verify/plugin-tool-verify.script.ts`
- **Gate**: e2e
- acceptance:
  - "Every captured tool with an outputSchema gets a static envelope check: safeParse({ok:false, error:{reason:'probe'}}) must succeed; failures render as their own failed row with the zod issue."
  - "Running the gate BEFORE the schema fixes lists the offenders (proves the detector works)."

### S2 — Widen the offender schemas to model the error envelope + regen types
- **Status**: pending
- **DependsOn**: [S1]
- **Files**: `plugins/audit/src/lib/tools/audit-consolidate.tool.ts`, `plugins/external-mcps/src/lib/tools/catalog.tool.ts`, `plugins/external-mcps/src/lib/tools/status.tool.ts`, `plugins/external-mcps/src/lib/tools/suggest.tool.ts`, `plugins/git/src/lib/tools/write-tools.ts`, `plugins/memory/src/lib/tools/tools.ts`, `plugins/proposals/src/lib/tools/authoring.tool.ts`, `plugins/proposals/src/lib/tools/adopt.tool.ts`, `plugins/proposals/src/lib/tools/inherit-host-instructions.tool.ts`, `plugins/status-marker/src/lib/tools/close-tools.ts`, `plugins/usage-tracking/src/lib/tools/clear.tool.ts`
- **Gate**: e2e
- acceptance:
  - "verify:tools 0 failed with the new probe active; per-plugin suites stay green; bun run types:generate regenerated in the same commit."

## acceptance

- Every captured tool with an outputSchema gets a static envelope check: safeParse({ok:false, error:{reason:'probe'}}) must succeed; failures render as their own failed row with the zod issue.
- Running the gate BEFORE the schema fixes lists the offenders (proves the detector works).
- verify:tools 0 failed with the new probe active; per-plugin suites stay green; bun run types:generate regenerated in the same commit.
