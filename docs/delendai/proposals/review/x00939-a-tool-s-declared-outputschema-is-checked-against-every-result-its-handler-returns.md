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

Every registered tool's outputSchema describes the results its handler returns: verify:tools reports, for every tool, whether its schema models the error envelope, and the repo rules say errors travel as text, compactOutputSchema registrations stop growing, and the contracts envelope is either produced or removed.

## why

Joint audit a00095. D20: the outputSchema ratchet checks the declared shape, never the handler's real returns; the golden spec fixes the declared serialisation only. G109: the dishonest-outputSchema family spans 30 plugins, not ~8, and no gate measures the denominator. G105: about 22 registrations announce an empty contract through compactOutputSchema. G110: packages/contracts declares a canonical envelope no tool produces and nothing imports. Measured while implementing: the SDK client validates structuredContent even on isError, but since 48880ea1a (2026-09-15) the host's instrumentation drops an error's structuredContent its schema rejects (conform-error-structured-content.helper.ts), so a listing client receives the error as text instead of -32602. The structure is not lost either: content[0].text carries the whole envelope and @delendai/client reads it. Measured: 252 of 281 schemas (50 plugins) do not model the envelope; modelling it in each would add about 110 bytes per tool to tools/list for nothing a client lacks. So the family is not a runtime defect since 48880ea1a: this proposal states the rule and reports the count, x00941 is settled by that commit, and x00940 keeps only its real defects (a zod-union output schema that breaks valid calls, and any failure code returned outside an error). The audit read tool sources, not the composed runtime.

## non-goals

- Making every schema model the error envelope: it would cost tools/list bytes for structure the error text already carries.
- Changing the MCP SDK's validation.

## slices

- global_gate: type

### S1 — verify:tools reports which schemas model the error envelope, and the rule says errors travel as text
- **Status**: review
- **Files**: `tools/scripts/verify/plugin-tool-verify.script.ts`, `tools/scripts/verify/verify-probes.ts`, `tools/scripts/verify/error-envelope-report.ts`, `tools/scripts/verify/error-envelope-report.spec.ts`, `packages/core/src/cli.ts`, `docs/delendai/REPO-RULES.md`
- **Gate**: type
- acceptance:
  - "For every registered tool with an outputSchema, effectful ones included, verify:tools asks the host's own conformance helper whether the envelope toolError sends keeps its structuredContent for a listing client."
  - "The run prints the denominator: schemas checked, schemas that do not model the envelope, per plugin (G109). It is informative: the host drops a non-conforming error structuredContent and the text carries the whole envelope, which the client reads."
  - "REPO-RULES states that an outputSchema describes the success answer, that errors travel as text, and that a schema need not model the error envelope."
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

- For every registered tool with an outputSchema, effectful ones included, verify:tools asks the host's own conformance helper whether the envelope toolError sends keeps its structuredContent for a listing client.
- The run prints the denominator: schemas checked, schemas that do not model the envelope, per plugin (G109). It is informative: the host drops a non-conforming error structuredContent and the text carries the whole envelope, which the client reads.
- REPO-RULES states that an outputSchema describes the success answer, that errors travel as text, and that a schema need not model the error envelope.
- The lint counts registrations whose outputSchema comes from compactOutputSchema and fails when the count exceeds its committed baseline (about 22 today, G105).
- The helper's JSDoc says what the empty contract costs the client and points to the lint.
- Either toolOk/toolError build their envelope from the contracts type and a spec proves a real tool result parses with it, or the unused envelope and its spec are removed with a note in the contracts README (G110).
- No export of packages/contracts is left without a producer or a consumer in the workspace.
