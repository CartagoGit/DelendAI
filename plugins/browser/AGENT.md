# AGENT.md — plugin `plugins/browser`

> Below the `<!-- mcp-vertex:begin agent-md -->
## Purpose

- Headless browser automation tools.

## Public API

- probePlaywright
- PLAYWRIGHT_INSTALL_HINT
- buildBrowserInspectToolRegistrations
- buildBrowserVerifyPageToolRegistrations
- buildBrowserA11yToolRegistrations
- mapAxeReport
- summarizeSeverity
- outcomeToFinding
- outcomesToFindings

## Depends on

- @mcp-vertex/core
- playwright

## Writes

- <host workspace>/.mcp-vertex/cache/browser/

## Entry points

- ./dist/index.js
- src/index.ts (default export → IMcpPlugin)

## Tests

_(none)_

## Do not

- Do not import `@mcp-vertex/core/lib/...`; use `@mcp-vertex/core/public`.
- Do not run user-facing shell or destructive tools without `dryRunSupported: true`.
- Do not surface absolute host paths; use `workspaceRoot`-relative paths only.

## Token hotspots

_(none)_

<!-- mcp-vertex:end agent-md -->

