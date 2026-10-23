---
id: x00939
title: "A tool's declared outputSchema is checked against every result its handler returns"
kind: fix
status: ready
type: proposal
track: a00095-consistency
date: 2026-10-23
---

# x00939 — A tool's declared outputSchema is checked against every result its handler returns

## goal

No registered tool can return a result, success or error, that its own outputSchema rejects: verify:tools drives each tool's error paths and validates them, compactOutputSchema registrations stop growing, and the contracts envelope is either produced or removed.

## why

Joint audit a00095. D20: the outputSchema ratchet checks the declared shape, never the handler's real returns; the golden spec fixes the declared serialisation only. G109: the dishonest-outputSchema family spans 30 plugins, not ~8, and no gate measures the denominator. G105: about 22 registrations announce an empty contract through compactOutputSchema. G110: packages/contracts declares a canonical envelope no tool produces and nothing imports. The MCP SDK client validates structuredContent even on isError, so each mismatch is a call the client rejects.

## non-goals

- Fixing each plugin's mismatches: the sibling proposals for core/proposals/external-mcps and for the other plugins do that; this one makes them visible and keeps them from coming back.
- Changing the MCP SDK's validation.

## slices

- global_gate: type

### S1 — verify:tools validates every result it provokes, error paths included
- **Status**: pending
- **Files**: `tools/scripts/verify/plugin-tool-verify.script.ts`, `tools/scripts/verify/plugin-tool-verify.script.spec.ts`, `docs/delendai/REPO-RULES.md`
- **Gate**: type
- acceptance:
  - "verify:tools calls each effect-free tool with an input its inputSchema accepts and one that makes the handler fail, and validates both results (structuredContent, isError included) against the declared outputSchema through a listing client."
  - "A fixture tool whose catch path returns toolError outside its success-only outputSchema makes verify:tools exit non-zero, naming the tool and the failing path."
  - "The run prints the denominator: tools checked, tools with a mismatch, per plugin (G109)."
  - "REPO-RULES states that an outputSchema must admit every result the handler returns, error results included."

### S2 — compactOutputSchema registrations are counted and may only decrease
- **Status**: pending
- **Files**: `tools/scripts/lint/tool-ok-envelope.script.ts`, `tools/scripts/lint/tool-ok-envelope.script.spec.ts`, `packages/core/src/lib/surface/compact-output-schema.helper.ts`
- **Gate**: type
- acceptance:
  - "The lint counts registrations whose outputSchema comes from compactOutputSchema and fails when the count exceeds its committed baseline (about 22 today, G105)."
  - "The helper's JSDoc says what the empty contract costs the client and points to the lint."

### S3 — The contracts envelope is the one tools produce, or it goes
- **Status**: pending
- **Files**: `packages/contracts/src/envelopes.ts`, `packages/contracts/tests/src/envelopes.spec.ts`, `packages/core/src/lib/shared/tool-response.ts`
- **Gate**: type
- acceptance:
  - "Either toolOk/toolError build their envelope from the contracts type and a spec proves a real tool result parses with it, or the unused envelope and its spec are removed with a note in the contracts README (G110)."
  - "No export of packages/contracts is left without a producer or a consumer in the workspace."

## acceptance

- verify:tools calls each effect-free tool with an input its inputSchema accepts and one that makes the handler fail, and validates both results (structuredContent, isError included) against the declared outputSchema through a listing client.
- A fixture tool whose catch path returns toolError outside its success-only outputSchema makes verify:tools exit non-zero, naming the tool and the failing path.
- The run prints the denominator: tools checked, tools with a mismatch, per plugin (G109).
- REPO-RULES states that an outputSchema must admit every result the handler returns, error results included.
- The lint counts registrations whose outputSchema comes from compactOutputSchema and fails when the count exceeds its committed baseline (about 22 today, G105).
- The helper's JSDoc says what the empty contract costs the client and points to the lint.
- Either toolOk/toolError build their envelope from the contracts type and a spec proves a real tool result parses with it, or the unused envelope and its spec are removed with a note in the contracts README (G110).
- No export of packages/contracts is left without a producer or a consumer in the workspace.
