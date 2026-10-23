---
id: x00940
title: "A union output schema and every external_mcp_call code reach the client as the schema says"
kind: fix
status: ready
type: proposal
track: a00095-consistency
date: 2026-10-23
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
- **Status**: pending
- **Files**: `packages/core/src/lib/project/sdk-object-output-schema.helper.ts`, `packages/core/src/lib/project/instrument-tool-handlers.helper.ts`, `packages/core/src/lib/project/create-mcp-project.ts`, `packages/core/src/lib/contracts/constants/declared-output-schema.constant.ts`, `tools/scripts/types/generate-tool-types.script.ts`, `packages/core/tests/src/lib/project/sdk-object-output-schema.helper.spec.ts`, `packages/core/tests/src/lib/project/instrument-tool-handlers.helper.spec.ts`
- **Gate**: type
- acceptance:
  - "Through a real client and server, a tool whose outputSchema is a union of objects is listed with an object schema and a valid answer arrives as structuredContent, not as an error (G61-MCP01)."
  - "The merged object accepts every answer any member accepts, and requires a field only when every member does."
  - "Such a tool still lists no outputSchema and the generated types keep the declared union, so tools/list bytes and tool-outputs.ts do not change."

### S2 — external_mcp_call's codes come from one list
- **Status**: pending
- **Files**: `plugins/external-mcps/src/lib/contracts/constants/call-failure-codes.constant.ts`, `plugins/external-mcps/src/lib/subprocess/server-registry.ts`, `plugins/external-mcps/src/lib/activation/activation-policy.interface.ts`, `plugins/external-mcps/src/lib/tools/invoke-proxy.ts`, `plugins/external-mcps/tests/src/lib/tools/call-output-schema.spec.ts`
- **Gate**: type
- acceptance:
  - "The activation denial codes, the registry failure codes and the outputSchema enum derive from one constant; the schema admits missing-env (D41, EXT-01)."

## acceptance

- Through a real client and server, a tool whose outputSchema is a union of objects is listed with an object schema and a valid answer arrives as structuredContent, not as an error (G61-MCP01).
- The merged object accepts every answer any member accepts, and requires a field only when every member does.
- The activation denial codes, the registry failure codes and the outputSchema enum derive from one constant; the schema admits missing-env (D41, EXT-01).
