# @mcp-vertex/error-reporting

Automatic, intrinsic error reporting for [`@mcp-vertex/core`](../../packages/core).

When a tool call fails and the failure **originates inside mcp-vertex itself**
(typed internal error or an `@mcp-vertex/*` frame is present), the plugin
opens a de-duplicated GitHub issue on the target repository using a safe DTO
built only from MCP Vertex-owned metadata.

## Status

**Implemented.** Ships in the `standard` preset (therefore also `swarm` and
`full`) and in the `vertex` preset. **Disabled by default** and opt-in.

## Behaviour

- **Intrinsic & disabled by default.** Loaded with the standard preset; set
  `plugins.error-reporting.options.enabled = true` to enable dispatch.
- **External project data is non-reportable by construction.** The reporter
  accepts only mcp-vertex-internal failures backed by typed internal errors
  or `@mcp-vertex/*` frame evidence. A host project's own errors are never
  sent upstream, and there is no runtime flag that re-enables them.
- **Privacy by construction.** Raw error messages, raw stack traces, tool
  args, cwd, workspace paths, repo metadata and host-specific strings are not
  part of the public report contract.
- **De-duplicated.** A stable fingerprint derived from package, code and safe
  internal frames means the same bug opens one issue per window (default 24h),
  not one per sighting.
- **Non-blocking.** The report is fire-and-forget and fully guarded. Offline
  machines are detected before `gh issue create` and no remote command is
  attempted. Missing `gh` or authentication is recorded locally and the
  server keeps running.

## Privacy policy

This plugin reports only MCP Vertex-owned diagnostic data for failures that
originate inside mcp-vertex itself. It does not collect or transmit host
project context, source files, prompts, docs, repository names, branches,
workspace paths, cwd, tool args, tool outputs, raw exception messages, raw
stacks, environment variables or request headers from the consuming project.

The network destination is fixed: the allowlisted GitHub repository is always
`CartagoGit/delendai`. Project configuration cannot override or redirect the
destination. The plugin does not derive the destination from runtime/project
data.

Dispatch uses the host's authenticated `gh issue create` command via the
shared CLI runner. The plugin passes only the `gh` argv and a `cwd`; it does
not forward project-specific headers or environment variables.

## Reporting policy

External project data is **non-reportable by construction**.

This is not a configurable option. The reporter accepts only
`ISafeMcpVertexReport` DTOs whose provenance has been resolved through
MCP Vertex-owned metadata and whose frames have been normalized to
package-relative `@mcp-vertex/*` paths. There is no API surface, schema
field, runtime option or feature flag that re-enables reporting of external
project data.

Each auto-created issue carries:

- the failing tool id and package id,
- the safe failure class and classification,
- only `@mcp-vertex/*` normalized frames,
- a de-duplication fingerprint,
- an optional synthetic example built from safe internal context,
- instructions to disable the feature.

Exact transmitted fields:

- Safe DTO fields: `reporterVersion`, `mcpVertexVersion`, `packageId`,
  `safeToolId`, `toolOwner`, `toolCategory`, `errorCode`,
  `failureClass`, `classification`, `fingerprint`, `mcpFrames`,
  `syntheticExample`, `environmentClass`.
- `mcpVertexVersion` is sourced from the published `@mcp-vertex/core`
  package version, not the monorepo root `package.json`.
- Issue-body table fields: `packageId`, `reporterVersion`,
  `mcpVertexVersion`, `classification`, `failureClass`, `fingerprint`,
  `safeToolId`, `toolOwner`, `toolCategory`, `errorCode`,
  `environmentClass`.
- Issue-body sections: `mcpFrames`, `syntheticExample`, the serialized safe
  DTO payload, and disable instructions.

## Disable it

```jsonc
{
  "plugins": {
    "error-reporting": { "options": { "enabled": false } }
  }
}
```

Inspect the current state with the `<prefix>_report_status` tool.

## Configuration

| Option              | Type       | Default                    | Purpose                                                                                         |
| ------------------- | ---------- | -------------------------- | ----------------------------------------------------------------------------------------------- |
| `enabled`           | `boolean`  | `false`                    | Master switch. `true` explicitly enables reporting.                                             |
| `targetRepo`        | `string`   | `CartagoGit/delendai`    | Deprecated and ignored. The destination is fixed and cannot be changed by the consumer project. |
| `labels`            | `string[]` | `["auto-reported", "bug"]` | Deprecated and ignored. MCP Vertex applies only its canonical labels.                           |
| `dedupeWindowHours` | `number`   | `24`                       | De-duplication window in hours.                                                                 |

## Removed option

- `internalOnly` — removed in `x00236`. Legacy values emit a deprecation
  warning and are ignored because external project data is non-reportable by
  construction.

## Design notes

- The plugin observes tool-call failures through the same lifecycle hook the
  `logs` plugin uses (`onToolCall` with an `error` argument). No polling, no
  separate process.
- The network seam accepts only `ISafeMcpVertexReport`; production uses the
  shared `runExternalTool` runner wrapping the host's authenticated `gh` CLI —
  the plugin never stores or prompts for a PAT.
- The read-only `<prefix>_report_status` tool exposes the fixed destination,
  exact transmitted fields, the disable switch, and each locally recorded
  fingerprint's canonical classification.
