---
id: x00940
title: "Core, proposals and external-mcps return errors that fit their own outputSchema"
kind: fix
status: ready
type: proposal
track: a00095-consistency
date: 2026-10-23
---

# x00940 — Core, proposals and external-mcps return errors that fit their own outputSchema

## goal

Every error path of the core tools, the proposals tools and external_mcp_call returns a result its declared outputSchema accepts, and a zod union output schema no longer breaks valid calls.

## why

Joint audit a00095. D4: proposals tools (REVIEW_OUTPUT_SCHEMA in authoring.tool.ts and the other `ok: z.literal(true)` schemas) return toolError outside their success-only schema. D10: plugin_activate / plugin_deactivate violate their own outputSchema on error. D41 + gpt-6.1-sol EXT-01: external_mcp_call can return code `missing-env`, which its outputSchema does not admit. Sol G61-MCP01: a zod union outputSchema makes the instrumented handler reject valid calls. The SDK client validates structuredContent even on isError, so each of these is a failed call for the client.

## non-goals

- Plugins outside core, proposals and external-mcps (sibling proposal).
- The gate that keeps the class out (sibling proposal x00939).

## slices

- global_gate: type

### S1 — Core tools and the handler instrumentation
- **Status**: pending
- **Files**: `packages/core/src/lib/tools/tool-surface.tool.ts`, `packages/core/src/lib/project/instrument-tool-handlers.helper.ts`, `plugins/api/src/lib/tools/api-validate.tool.ts`
- **Gate**: type
- acceptance:
  - "plugin_activate and plugin_deactivate declare an outputSchema whose error branch matches what toolError returns, and a spec calls each through a listing client on an unknown plugin and gets a validated error (D10)."
  - "A tool whose outputSchema is a zod union is listed and called successfully through a listing client; a spec reproduces the failure before the fix (G61-MCP01)."

### S2 — Proposals tools
- **Status**: pending
- **Files**: `plugins/proposals/src/lib/tools/authoring.tool.ts`, `plugins/proposals/src/lib/tools/adopt.tool.ts`, `plugins/proposals/src/lib/tools/agents-lock-diagnose.tool.ts`, `plugins/proposals/src/lib/tools/auto-fix-queue.tool.ts`, `plugins/proposals/src/lib/tools/incident-proposal.tool.ts`, `plugins/proposals/src/lib/tools/inherit-host-instructions.tool.ts`
- **Gate**: type
- acceptance:
  - "Each proposals tool that declares `ok: z.literal(true)` and can return toolError either admits the error branch in its schema or stops returning it; proposal_review's refusal (unknown slice) validates through a listing client (D4)."
  - "verify:tools (x00939 S1) reports no mismatch for the proposals plugin."

### S3 — external_mcp_call
- **Status**: pending
- **Files**: `plugins/external-mcps/src/lib/subprocess/server-registry.ts`, `plugins/external-mcps/src/lib/tools/invoke-proxy.ts`
- **Gate**: type
- acceptance:
  - "external_mcp_call's outputSchema admits every ExternalCallFailureCode the registry can return, missing-env included, and a spec with a server missing its env gets a validated error result (D41, EXT-01)."

## acceptance

- plugin_activate and plugin_deactivate declare an outputSchema whose error branch matches what toolError returns, and a spec calls each through a listing client on an unknown plugin and gets a validated error (D10).
- A tool whose outputSchema is a zod union is listed and called successfully through a listing client; a spec reproduces the failure before the fix (G61-MCP01).
- Each proposals tool that declares `ok: z.literal(true)` and can return toolError either admits the error branch in its schema or stops returning it; proposal_review's refusal (unknown slice) validates through a listing client (D4).
- verify:tools (x00939 S1) reports no mismatch for the proposals plugin.
- external_mcp_call's outputSchema admits every ExternalCallFailureCode the registry can return, missing-env included, and a spec with a server missing its env gets a validated error result (D41, EXT-01).
