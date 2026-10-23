---
id: x00939
title: "A tool's declared outputSchema is checked against every result its handler returns"
kind: fix
status: review
type: proposal
track: a00095-consistency
date: 2026-10-23
last-transition-id: 62122bb1-b094-477d-aeb1-07040bd1e259
last-correlation-id: 62122bb1-b094-477d-aeb1-07040bd1e259
last-transition-from: in-progress
last-transition-at: 2026-10-23T12:13:00.967Z
---

# x00939 — A tool's declared outputSchema is checked against every result its handler returns

## goal

Every registered tool's outputSchema describes the results its handler returns: verify:tools measures, for every tool, whether its error envelope reaches a listing client, and that set only shrinks, compactOutputSchema registrations stop growing, and the contracts envelope is either produced or removed.

## why

Joint audit a00095. D20: the outputSchema ratchet checks the declared shape, never the handler's real returns; the golden spec fixes the declared serialisation only. G109: the dishonest-outputSchema family spans 30 plugins, not ~8, and no gate measures the denominator. G105: about 22 registrations announce an empty contract through compactOutputSchema. G110: packages/contracts declares a canonical envelope no tool produces and nothing imports. Measured while implementing: the SDK client validates structuredContent even on isError, but since 48880ea1a (2026-09-15) the host's instrumentation drops an error's structuredContent its schema rejects (conform-error-structured-content.helper.ts), so a listing client receives the error as text instead of -32602. The cost that remains is lost structure: the code and next action reach the caller only inside text. The audit's reading missed the composed runtime; the gate measures what a client really receives.

## non-goals

- Fixing each plugin's mismatches: the sibling proposals for core/proposals/external-mcps and for the other plugins do that; this one makes them visible and keeps them from coming back.
- Changing the MCP SDK's validation.

## slices

- global_gate: type

### S1 — verify:tools measures which schemas lose the error envelope, and the set may only shrink
- **Status**: review
- **Files**: `tools/scripts/verify/plugin-tool-verify.script.ts`, `tools/scripts/verify/verify-probes.ts`, `tools/scripts/verify/error-envelope-ratchet.ts`, `tools/scripts/verify/error-envelope-ratchet.spec.ts`, `tools/scripts/verify/error-envelope.baseline.json`, `packages/core/src/cli.ts`, `docs/delendai/REPO-RULES.md`
- **Gate**: type
- acceptance:
  - "For every registered tool with an outputSchema, effectful ones included, verify:tools asks the host's own conformance helper whether the envelope toolError sends survives to a listing client."
  - "A tool missing from the baseline whose schema does not model the envelope makes verify:tools exit non-zero, naming it; a baseline entry that models it now, or is gone, fails too, so the list only shrinks."
  - "The run prints the denominator: tools checked, tools that do not model the envelope, per plugin (G109)."
  - "REPO-RULES states that an outputSchema models the error envelope its handler returns."
- shipped-in: `17e9c3011e3c`
- review-state: in_review
- review-implementer: claude-opus-5-5

### S2 — compactOutputSchema registrations are counted and may only decrease
- **Status**: review
- **Files**: `tools/scripts/lint/tool-ok-envelope.script.ts`, `tools/scripts/lint/tool-ok-envelope.script.spec.ts`, `packages/core/src/lib/surface/compact-output-schema.helper.ts`
- **Gate**: type
- acceptance:
  - "The lint counts registrations whose outputSchema comes from compactOutputSchema and fails when the count exceeds its committed baseline (about 22 today, G105)."
  - "The helper's JSDoc says what the empty contract costs the client and points to the lint."
- shipped-in: `17e9c3011e3c`
- review-state: in_review
- review-implementer: claude-opus-5-5

### S3 — The contracts envelope is the one tools produce, or it goes
- **Status**: review
- **Files**: `packages/contracts/src/envelopes.ts`, `packages/contracts/tests/src/envelopes.spec.ts`, `packages/core/src/lib/shared/tool-response.ts`, `packages/core/tests/src/lib/shared/tool-response.spec.ts`
- **Gate**: type
- acceptance:
  - "Either toolOk/toolError build their envelope from the contracts type and a spec proves a real tool result parses with it, or the unused envelope and its spec are removed with a note in the contracts README (G110)."
  - "No export of packages/contracts is left without a producer or a consumer in the workspace."
- shipped-in: `17e9c3011e3c`
- review-state: in_review
- review-implementer: claude-opus-5-5

## acceptance

- For every registered tool with an outputSchema, effectful ones included, verify:tools asks the host's own conformance helper whether the envelope toolError sends survives to a listing client.
- A tool missing from the baseline whose schema does not model the envelope makes verify:tools exit non-zero, naming it; a baseline entry that models it now, or is gone, fails too, so the list only shrinks.
- The run prints the denominator: tools checked, tools that do not model the envelope, per plugin (G109).
- REPO-RULES states that an outputSchema models the error envelope its handler returns.
- The lint counts registrations whose outputSchema comes from compactOutputSchema and fails when the count exceeds its committed baseline (about 22 today, G105).
- The helper's JSDoc says what the empty contract costs the client and points to the lint.
- Either toolOk/toolError build their envelope from the contracts type and a spec proves a real tool result parses with it, or the unused envelope and its spec are removed with a note in the contracts README (G110).
- No export of packages/contracts is left without a producer or a consumer in the workspace.
