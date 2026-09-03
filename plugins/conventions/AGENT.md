# AGENT.md — plugin `plugins/conventions`

> Below the `<!-- mcp-vertex:begin agent-md -->
## Purpose

- Repo file-convention enforcement (interface, constant, service, tool …).

## Public API

- classifyPath
- TYPESCRIPT_RULES
- type IRoleRule
- type Role
- scanConventions
- type IConventionsScanResult
- type IDirEntry
- type IDirReader

## Depends on

- @modelcontextprotocol/sdk
- zod
- @mcp-vertex/core

## Writes

- <host workspace>/.mcp-vertex/cache/conventions/

## Entry points

- ./dist/index.js
- src/index.ts (default export → IMcpPlugin)

## Tests

- plugins/conventions/tests/src/lib/plugin.spec.ts
- plugins/conventions/tests/src/lib/profiles/language-profiles.spec.ts
- plugins/conventions/tests/src/lib/profiles/profile-registry.spec.ts
- plugins/conventions/tests/src/lib/services/conventions-scan.service.spec.ts

## Do not

- Do not import `@mcp-vertex/core/lib/...`; use `@mcp-vertex/core/public`.
- Do not run user-facing shell or destructive tools without `dryRunSupported: true`.
- Do not surface absolute host paths; use `workspaceRoot`-relative paths only.

## Token hotspots

_(none)_

<!-- mcp-vertex:end agent-md -->

