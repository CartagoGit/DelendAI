---
id: x00939
title: "A tool's declared outputSchema is checked against every result its handler returns"
kind: fix
status: in-progress
type: proposal
track: a00095-consistency
date: 2026-10-23
last-transition-id: 32102f7a-9259-4ccb-96cf-4c698c202757
last-correlation-id: 32102f7a-9259-4ccb-96cf-4c698c202757
last-transition-from: ready
last-transition-at: 2026-11-01T00:37:47.417Z
shipped-in:
  - "40c0b226b46ab1eaf5c31ac4197efc95cb4140f6"
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
- **Status**: done
- **Files**: `tools/scripts/verify/plugin-tool-verify.script.ts`, `tools/scripts/verify/verify-probes.ts`, `tools/scripts/verify/error-envelope-report.ts`, `tools/scripts/verify/error-envelope-report.spec.ts`, `packages/core/src/cli.ts`, `docs/delendai/REPO-RULES.md`
- **Gate**: type
- acceptance:
  - "For every registered tool with an outputSchema, effectful ones included, verify:tools asks the host's own conformance helper whether the envelope toolError sends keeps its structuredContent for a listing client."
  - "The run prints the denominator: schemas checked, schemas that do not model the envelope, per plugin (G109). It is informative: the host drops a non-conforming error structuredContent and the text carries the whole envelope, which the client reads."
  - "REPO-RULES states that an outputSchema describes the success answer, that errors travel as text, and that a schema need not model the error envelope."
- shipped-in: `17e9c3011e3c`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: claude-sonnet-5-5
- review-log: approved by claude-sonnet-5-5 — verified at 40c0b226b46a, validate exit 0 and tests 39/39 claimed, no recorded run cited; acceptance 3/3: (1) error-envelope-report.spec (modelsErrorEnvelope, unmodelledByPlugin) passes; verify-probes and plugin-tool-verify changed (files present) (2) unmodelledByPlugin counts per plugin, most first; prints denominator per diff (3) REPO-RULES rule 8 added: outputSchema for success, errors travel as text, schema need not model the envelope — verified by code reading and spec runs

### S2 — compactOutputSchema registrations are counted and may only decrease
- **Status**: done
- **Files**: `tools/scripts/lint/tool-ok-envelope.script.ts`, `tools/scripts/lint/tool-ok-envelope.script.spec.ts`, `packages/core/src/lib/surface/compact-output-schema.helper.ts`
- **Gate**: type
- acceptance:
  - "The lint counts registrations whose outputSchema comes from compactOutputSchema and fails when the count exceeds its committed baseline (about 22 today, G105)."
  - "The helper's JSDoc says what the empty contract costs the client and points to the lint."
- shipped-in: `17e9c3011e3c`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: claude-sonnet-5-5
- review-log: approved by claude-sonnet-5-5 — verified at 40c0b226b46a, validate exit 0 and tests 39/39 claimed, no recorded run cited; acceptance 2/2: (1) tool-ok-envelope.script.spec 'counts calls in source, not in specs nor in the helper' and 'fails over the ceiling and asks to lower it' pass; lint run clean (2) compact-output-schema.helper.ts JSDoc changed (diff lists it) — verified by code reading and spec runs

### S3 — The contracts envelope is the one tools produce, or it goes
- **Status**: pending
- **Files**: `packages/contracts/src/envelopes.ts`, `packages/contracts/tests/src/envelopes.spec.ts`, `packages/core/src/lib/shared/tool-response.ts`, `packages/core/tests/src/lib/shared/tool-response.spec.ts`
- **Gate**: type
- acceptance:
  - "Either toolOk/toolError build their envelope from the contracts type and a spec proves a real tool result parses with it, or the unused envelope and its spec are removed with a note in the contracts README (G110)."
  - "No export of packages/contracts is left without a producer or a consumer in the workspace."
- shipped-in: `17e9c3011e3c`
- review-state: changes_requested
- review-implementer: claude-opus-5-5
- review-reviewer: claude-sonnet-5-5
- review-log: requested_changes by claude-sonnet-5-5 — Criterion 1 holds: tool-response.spec 'toolError and toolOk produce the envelopes @delendai/contracts declares' passes. Criterion 2 does not: ICheckpointAdvisoryEnvelope (packages/contracts/src/envelopes.ts:43) is referenced only by packages/contracts/tests/src/envelopes.spec.ts, no producer or consumer in the workspace. Remove it with its spec case, or use it.

## acceptance

- For every registered tool with an outputSchema, effectful ones included, verify:tools asks the host's own conformance helper whether the envelope toolError sends keeps its structuredContent for a listing client.
- The run prints the denominator: schemas checked, schemas that do not model the envelope, per plugin (G109). It is informative: the host drops a non-conforming error structuredContent and the text carries the whole envelope, which the client reads.
- REPO-RULES states that an outputSchema describes the success answer, that errors travel as text, and that a schema need not model the error envelope.
- The lint counts registrations whose outputSchema comes from compactOutputSchema and fails when the count exceeds its committed baseline (about 22 today, G105).
- The helper's JSDoc says what the empty contract costs the client and points to the lint.
- Either toolOk/toolError build their envelope from the contracts type and a spec proves a real tool result parses with it, or the unused envelope and its spec are removed with a note in the contracts README (G110).
- No export of packages/contracts is left without a producer or a consumer in the workspace.
