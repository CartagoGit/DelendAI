# @mcp-vertex/error-reporting

Automatic, intrinsic error reporting for [`@mcp-vertex/core`](../../packages/core).

When a tool call fails and the failure **originates inside mcp-vertex itself**
(typed internal error or an `@mcp-vertex/*` frame is present), the plugin
opens a de-duplicated GitHub issue on the target repository using a safe DTO
built only from MCP Vertex-owned metadata.

## Status

**Implemented.** Ships in the `standard` preset (therefore also `swarm` and
`full`) and in the `vertex` preset. **Enabled by default** and opt-out.

## Behaviour

- **Intrinsic & enabled by default.** Loaded with the standard preset; no
  config needed.
- **Internal-only by default.** Only mcp-vertex-internal failures are
  reported. A host project's own errors are never sent upstream.
- **Privacy by construction.** Raw error messages, raw stack traces, tool
  args, cwd, workspace paths, repo metadata and host-specific strings are not
  part of the public report contract.
- **De-duplicated.** A stable fingerprint derived from package, code and safe
  internal frames means the same bug opens one issue per window (default 24h),
  not one per sighting.
- **Non-blocking.** The report is fire-and-forget and fully guarded. Without
  `gh`, without auth, or offline, the report is silently dropped and the
  server keeps running.

## Privacy policy

This plugin reports only MCP Vertex-owned diagnostic data for failures that
originate inside mcp-vertex itself. It does not collect or transmit host
project context, source files, prompts, docs, repository names, branches,
workspace paths, cwd, tool args, tool outputs, raw exception messages, raw
stacks, environment variables or request headers from the consuming project.

The network destination is fixed per installation: one allowlisted GitHub
repository resolved from plugin options. By default that is
`CartagoGit/mcp-vertex`; an operator may override it explicitly with
`plugins.error-reporting.options.targetRepo`. The plugin does not derive the
destination from runtime/project data.

Dispatch uses the host's authenticated `gh issue create` command via the
shared CLI runner. The plugin passes only the `gh` argv and a `cwd`; it does
not forward project-specific headers or environment variables.

Each auto-created issue carries:

- the failing tool id and package id,
- the safe failure class and classification,
- only `@mcp-vertex/*` normalized frames,
- a de-duplication fingerprint,
- an optional synthetic example built from safe internal context,
- instructions to disable the feature.

Exact transmitted fields:

- Safe DTO fields: `reporterVersion`, `mcpVertexVersion`, `packageId`,
  `toolId`, `errorCode`, `failureClass`, `classification`, `fingerprint`,
  `mcpFrames`, `syntheticExample`, `environmentClass`.
- Issue-body table fields: `packageId`, `reporterVersion`,
  `mcpVertexVersion`, `classification`, `failureClass`, `fingerprint`,
  `toolId`, `errorCode`, `environmentClass`.
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

| Option | Type | Default | Purpose |
|---|---|---|---|
| `enabled` | `boolean` | `true` | Master switch. `false` disables reporting entirely. |
| `targetRepo` | `string` | `CartagoGit/mcp-vertex` | Fixed `owner/name` destination. Only explicit plugin config may override the default. |
| `labels` | `string[]` | `["auto-reported", "bug"]` | Labels on auto-created issues. |
| `internalOnly` | `boolean` | `true` | Report only mcp-vertex-internal failures. |
| `dedupeWindowHours` | `number` | `24` | De-duplication window in hours. |

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
