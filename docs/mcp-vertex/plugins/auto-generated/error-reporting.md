---
id: error-reporting
package: @mcp-vertex/error-reporting
version: 0.1.0
maturity: stable
generated: 2026-09-02T06:52:14.677Z
---

# Error Reporting

> Auto-generated. Do not edit. Regenerate with bun run generate:from-manifests.

## Summary

Automatic mcp-vertex error reporting: opens de-duplicated GitHub issues for internal failures after explicit opt-in.

## Tags

- error-reporting
- github
- issues

## Presets

- standard
- swarm
- full
- vertex

## Permissions

- network
- forge-write

## Dependencies

- @mcp-vertex/core
- @modelcontextprotocol/sdk
- zod

## Capabilities

- error-reporting
- github
- issues

## Notes

`@mcp-vertex/error-reporting` reports only MCP Vertex-owned diagnostic data
for failures that originate inside MCP Vertex itself.

### Reporting policy

External project data is **non-reportable by construction**.

This is not a configurable option. The reporter accepts only
`ISafeMcpVertexReport` DTOs whose provenance has been resolved through the
plugin registry and whose frames have been normalized to package-relative
`@mcp-vertex/*` paths. There is no API surface, schema field, runtime option
or feature flag that re-enables reporting of external project data.

`mcpVertexVersion` in the public DTO comes from the published
`@mcp-vertex/core` package version, not the monorepo root `package.json`.

`safeToolId` is present only for registry-verified `@mcp-vertex/*` tools.
Host/project tools never expose their raw names; the public DTO reduces them
to the coarse fields `toolOwner` and `toolCategory`.

If you need to disable the reporter entirely, do so at the host
configuration level with `plugins.error-reporting.options.enabled = false`.
The privacy boundary is on the content, not on a per-error opt-out.

### Configurable options

- `enabled` controls whether the plugin dispatches reports at all.
- `targetRepo` fixes the allowlisted `owner/name` destination.
- `labels` defines the labels added to created issues.
- `dedupeWindowHours` controls the success de-duplication window.
- `maxIssuesPerDay` limits how many new issues one installation can create
  in a UTC day.
- `circuitBreakerThreshold`, `backoffBaseMs`, `backoffMaxMs`, and
  `backoffJitterRatio` tune retry and cooldown behaviour.

### Removed option

- `internalOnly` — removed in `x00236`. Legacy values emit a deprecation
  warning and are ignored because external project data is non-reportable by
  construction.
