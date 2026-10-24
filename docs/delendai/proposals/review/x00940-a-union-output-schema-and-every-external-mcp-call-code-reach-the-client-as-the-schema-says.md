---
id: x00940
title: "A union output schema and every external_mcp_call code reach the client as the schema says"
kind: fix
status: review
type: proposal
track: a00095-consistency
date: 2026-10-23
last-transition-id: bc3025ab-9a52-4526-b29c-a4e5da58669e
last-correlation-id: bc3025ab-9a52-4526-b29c-a4e5da58669e
last-transition-from: in-progress
last-transition-at: 2026-10-23T17:03:44.402Z
shipped-in:
  - "a41408119dc3a080a3bffc9e3b1a3ec631bf8887"
---

# x00940 — A union output schema and every external_mcp_call code reach the client as the schema says

## goal

A tool whose outputSchema is a union of objects is listed with a schema and answers valid calls, and every code external_mcp_call answers a refused or failed call with is one its outputSchema admits.

## why

Joint audit a00095. gpt-6.1-sol G61-MCP01: the MCP SDK takes an object schema as outputSchema; given a zod union it lists no schema and then fails the call (`undefined is not an object (evaluating 's._zod')`), so api_validate answered a valid call as an error in the native surface; about ten tools across api, audit-orchestrator, changelog, commit-policy, container and database declare unions. D41 and sol EXT-01: external_mcp_call answers failures as success results (`ok: false` with a code, not isError), so a listing client validates them, and its schema's enum lacked `missing-env`, which the registry returns.

Re-scoped while implementing x00939: D4 and D10 (proposals and core tools returning toolError outside a success-only schema) are not runtime defects since 48880ea1a: the host drops an error's structuredContent its schema rejects and the error travels as text, which the client reads.

## non-goals

- Making success-only schemas model the error envelope (x00939 states why not).
- Changing the SDK.

## slices

- global_gate: type

### S1 — A union of objects is registered as one object the SDK can use
- **Status**: done
- **Files**: `packages/core/src/lib/project/sdk-object-output-schema.helper.ts`, `packages/core/src/lib/project/instrument-tool-handlers.helper.ts`, `packages/core/src/lib/project/create-mcp-project.ts`, `packages/core/src/lib/contracts/constants/declared-output-schema.constant.ts`, `tools/scripts/types/generate-tool-types.script.ts`, `packages/core/tests/src/lib/project/sdk-object-output-schema.helper.spec.ts`, `packages/core/tests/src/lib/project/instrument-tool-handlers.helper.spec.ts`
- **Gate**: type
- acceptance:
  - "Through a real client and server, a tool whose outputSchema is a union of objects is listed with an object schema and a valid answer arrives as structuredContent, not as an error (G61-MCP01)."
  - "The merged object accepts every answer any member accepts, and requires a field only when every member does."
  - "Such a tool still lists no outputSchema and the generated types keep the declared union, so tools/list bytes and tool-outputs.ts do not change."
- shipped-in: `a90e74b68a14`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: claude-sonnet-5-5
- review-log: approved by claude-sonnet-5-5 — verified at a41408119dc3, validate exit 0 and tests 10/10 claimed, no recorded run cited; acceptance 3/3: (1) instrument-tool-handlers.helper.spec 'lists and answers a tool whose output schema is a union of objects' passes over the protocol (2) sdk-object-output-schema.helper.spec merge and required-intersection tests pass (3) DECLARED_OUTPUT_SCHEMA stored on the handler and generate-tool-types uses declaredOutputSchema ?? outputSchema; code read on develop — read code and ran 3 specs

### S2 — external_mcp_call's codes come from one list
- **Status**: review
- **Files**: `plugins/external-mcps/src/lib/contracts/constants/call-failure-codes.constant.ts`, `plugins/external-mcps/src/lib/subprocess/server-registry.ts`, `plugins/external-mcps/src/lib/activation/activation-policy.interface.ts`, `plugins/external-mcps/src/lib/tools/invoke-proxy.ts`, `plugins/external-mcps/tests/src/lib/tools/call-output-schema.spec.ts`
- **Gate**: type
- acceptance:
  - "The activation denial codes, the registry failure codes and the outputSchema enum derive from one constant; the schema admits missing-env (D41, EXT-01)."
- shipped-in: `c8397a11e389`
- review-state: in_review
- review-implementer: claude-opus-5-5

## acceptance

- Through a real client and server, a tool whose outputSchema is a union of objects is listed with an object schema and a valid answer arrives as structuredContent, not as an error (G61-MCP01).
- The merged object accepts every answer any member accepts, and requires a field only when every member does.
- The activation denial codes, the registry failure codes and the outputSchema enum derive from one constant; the schema admits missing-env (D41, EXT-01).
