# Error Reporting

`@mcp-vertex/error-reporting` reports only MCP Vertex-owned diagnostic data
for failures that originate inside MCP Vertex itself.

## Reporting policy

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

## Configurable options

- `enabled` controls whether the plugin dispatches reports at all.
- `targetRepo` fixes the allowlisted `owner/name` destination.
- `labels` defines the labels added to created issues.
- `dedupeWindowHours` controls the success de-duplication window.
- `maxIssuesPerDay` limits how many new issues one installation can create
  in a UTC day.
- `circuitBreakerThreshold`, `backoffBaseMs`, `backoffMaxMs`, and
  `backoffJitterRatio` tune retry and cooldown behaviour.

## Removed option

- `internalOnly` — removed in `x00236`. Legacy values emit a deprecation
  warning and are ignored because external project data is non-reportable by
  construction.