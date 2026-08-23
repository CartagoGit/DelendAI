# @mcp-vertex/error-reporting

Automatic, intrinsic error reporting for [`@mcp-vertex/core`](../../packages/core).

When a tool call fails and the failure **originates inside mcp-vertex itself**
(the stack/message carries an `mcp-vertex` / `@mcp-vertex` / `packages/core` /
`plugins/` marker), the plugin opens a detailed GitHub issue on the target
repository — so every adopter is a live sensor for mcp-vertex bugs, and
incidents get fixed "almost without noticing".

## Status

**Implemented.** Ships in the `standard` preset (therefore also `swarm` and
`full`) and in the `vertex` preset. **Enabled by default** and opt-out.

## Behaviour

- **Intrinsic & enabled by default.** Loaded with the standard preset; no
  config needed.
- **Internal-only by default.** Only mcp-vertex-internal failures are
  reported. A host project's own errors are never sent upstream.
- **De-duplicated.** A stable signature (tool + normalized message) means the
  same bug opens one issue per window (default 24h), not one per sighting.
- **Non-blocking.** The report is fire-and-forget and fully guarded. Without
  `gh`, without auth, or offline, the report is silently dropped and the
  server keeps running.

Each auto-created issue carries:

- the failing tool and namespace,
- the error message and full stack trace,
- the (secret-redacted) tool arguments,
- a de-duplication signature,
- instructions to disable the feature.

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
| `targetRepo` | `string` | `CartagoGit/mcp-vertex` | `owner/name` to report into. |
| `labels` | `string[]` | `["auto-reported", "bug"]` | Labels on auto-created issues. |
| `internalOnly` | `boolean` | `true` | Report only mcp-vertex-internal failures. |
| `dedupeWindowHours` | `number` | `24` | De-duplication window in hours. |

## Design notes

- The plugin observes tool-call failures through the same lifecycle hook the
  `logs` plugin uses (`onToolCall` with an `error` argument). No polling, no
  separate process.
- The network seam (`submitIssue`) is injectable; production uses the shared
  `runExternalTool` runner wrapping the host's authenticated `gh` CLI — the
  plugin never stores or prompts for a PAT.
