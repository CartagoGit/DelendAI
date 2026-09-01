# AGENT.md — plugin `plugins/security`

> Below the `<!-- mcp-vertex:begin agent-md -->
## Purpose

- Security audit (CVEs, SAST, secrets, env).

## Public API

- scanSecrets
- runSecretScan
- realScanDeps
- parseAuditJson
- queryOsv
- runAuditCommand
- detectStack
- parseSastJson
- runSastRunner
- SAST_RULES
- SECRET_RULES

## Depends on

- @mcp-vertex/deps
- @mcp-vertex/web-fetch
- @modelcontextprotocol/sdk
- zod
- @mcp-vertex/core

## Writes

- <host workspace>/.mcp-vertex/cache/security/

## Entry points

- ./dist/index.js
- src/index.ts (default export → IMcpPlugin)

## Tests

- plugins/security/tests/src/lib/run-audit.spec.ts
- plugins/security/tests/src/lib/run-scan.spec.ts
- plugins/security/tests/src/lib/scan-secrets.spec.ts
- plugins/security/tests/src/lib/tools/security-gate.spec.ts

## Do not

- Do not import `@mcp-vertex/core/lib/...`; use `@mcp-vertex/core/public`.
- Do not run user-facing shell or destructive tools without `dryRunSupported: true`.
- Do not surface absolute host paths; use `workspaceRoot`-relative paths only.

## Token hotspots

_(none)_

<!-- mcp-vertex:end agent-md -->

