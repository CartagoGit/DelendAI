# AGENT.md — plugin `plugins/i18n`

> Below the `<!-- mcp-vertex:begin agent-md -->
## Purpose

- i18n key/interpolation validation across locale JSON files.

## Public API

- checkLocales
- flattenKeys
- realI18nDeps
- extractUsedKeys
- validateInterpolation

## Depends on

- @modelcontextprotocol/sdk
- zod
- @mcp-vertex/core

## Writes

- <host workspace>/.mcp-vertex/cache/i18n/

## Entry points

- ./dist/index.js
- src/index.ts (default export → IMcpPlugin)

## Tests

- plugins/i18n/tests/src/lib/check-i18n.spec.ts
- plugins/i18n/tests/src/lib/tools/i18n-check.tool.spec.ts
- plugins/i18n/tests/src/lib/tools/i18n-validate.tool.spec.ts
- plugins/i18n/tests/src/lib/validate-interpolation.spec.ts

## Do not

- Do not import `@mcp-vertex/core/lib/...`; use `@mcp-vertex/core/public`.
- Do not run user-facing shell or destructive tools without `dryRunSupported: true`.
- Do not surface absolute host paths; use `workspaceRoot`-relative paths only.

## Token hotspots

_(none)_

<!-- mcp-vertex:end agent-md -->

