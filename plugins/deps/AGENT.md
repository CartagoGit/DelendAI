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

- plugins/deps/tests/src/lib/audit.spec.ts
- plugins/deps/tests/src/lib/deps-polyglot.spec.ts
- plugins/deps/tests/src/lib/deps-tree.spec.ts
- plugins/deps/tests/src/lib/deps.spec.ts

## Do not

- Do not run `git stash`; this repo forbids stashes (see `tools/scripts/lint/no-stashes.script.ts`) — a shared worktree can lose another agent's stashed work.
- Do not hand-edit content between `<!-- mcp-vertex:begin -->`/`<!-- mcp-vertex:end -->` markers; regenerate via the owning `gen:*` script instead.
- Do not import `@mcp-vertex/core/lib/...`; use `@mcp-vertex/core/public`.
- Do not run user-facing shell or destructive tools without `dryRunSupported: true`.
- Do not surface absolute host paths; use `workspaceRoot`-relative paths only.

## Token hotspots

_(none)_

<!-- mcp-vertex:end agent-md -->

