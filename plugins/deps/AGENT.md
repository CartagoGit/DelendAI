# AGENT.md — plugin `plugins/deps`

> Below the `<!-- mcp-vertex:begin agent-md -->
## Purpose

- Dependency inventory + offline health (deps_list, deps_check, deps_audit, deps_licenses, deps_tree).

## Public API

- default
- listDeps
- checkDeps
- checkOutdated
- fetchLatestFromNpm
- listPolyglotDeps
- parseCargoToml
- parseGoMod
- parsePyprojectToml
- buildDepsToolRegistrations
- parseBunAudit
- runDepsAudit
- classifyLicense
- realLicenseDeps

## Depends on

- @modelcontextprotocol/sdk
- zod
- @mcp-vertex/core

## Writes

- <host workspace>/.mcp-vertex/cache/deps/

## Entry points

- ./dist/index.js
- src/index.ts (default export → IMcpPlugin)

## Tests

- plugins/deps/tests/src/lib/licenses.spec.ts
- plugins/deps/tests/src/lib/deps-tree.spec.ts
- plugins/deps/tests/src/lib/write-tools.spec.ts
- plugins/deps/tests/src/lib/deps.spec.ts

## Do not

- Do not import `@mcp-vertex/core/lib/...`; use `@mcp-vertex/core/public`.
- Do not run user-facing shell or destructive tools without `dryRunSupported: true`.
- Do not surface absolute host paths; use `workspaceRoot`-relative paths only.

## Token hotspots

_(none)_

<!-- mcp-vertex:end agent-md -->

