# AGENT.md — plugin `plugins/audit`

> Below the `<!-- mcp-vertex:begin agent-md -->
## Purpose

- Multi-model audit planning + consolidation; f00139 adds self_audit dogfood loop.

## Public API

- buildBrief
- ALL_SCOPES
- SCOPE_LABEL
- parseAuditBody
- parseAuditFiles
- consolidateAudits
- renderConsolidationMarkdown
- auditDateStamp
- auditFilename
- callLlm
- callLlmFanOut
- isoDate
- resolveTarget
- proposalFilenameFor

## Depends on

- @modelcontextprotocol/sdk
- zod
- @mcp-vertex/core

## Writes

- <host workspace>/.mcp-vertex/cache/audit/

## Entry points

- ./dist/index.js
- src/index.ts (default export → IMcpPlugin)

## Tests

- plugins/audit/tests/src/lib/plugin-options.spec.ts
- plugins/audit/tests/src/lib/self-audit/aggregate.spec.ts
- plugins/audit/tests/src/lib/self-audit/file-proposals.spec.ts
- plugins/audit/tests/src/lib/self-audit/rank.spec.ts

## Do not

- Do not import `@mcp-vertex/core/lib/...`; use `@mcp-vertex/core/public`.
- Do not run user-facing shell or destructive tools without `dryRunSupported: true`.
- Do not surface absolute host paths; use `workspaceRoot`-relative paths only.

## Token hotspots

_(none)_

<!-- mcp-vertex:end agent-md -->

