---
title: Configuration Center
description: Configure mcp-vertex plugins and inspect artifact ownership safely from VS Code.
order: 2
navLabel: Configuration
---

# Configuration Center

Run **MCP Vertex: Open Configuration Center** in VS Code. Choose a workspace in multi-root windows. The editor shows General settings, Plugins, Providers, Agents, Skills, Prompts, Resources and Knowledge. Plugin and artifact badges identify bundled, project-local and external ownership.

## Safe project editing

The center edits only `mcp-vertex.config.json`. VS Code server command, arguments, prefix, theme and language remain host preferences. Saving uses an exact file digest, path-level merge, full-schema validation and atomic replacement. Unknown fields and disabled external definitions are preserved. If the file changed elsewhere, discard/reload and reapply the intended fields.

Secret-looking values are hidden and read-only. External MCP `env` entries are variable names, never values. Restart the MCP server after a changed save to apply runtime changes.

## Plugin authors

Expose `optionsSchema` from the same `definePlugin(...)` object that validates `ctx.options`; schema defaults and fields appear automatically. Keep `configExample.options` valid against that schema. A plugin declared with `plugins.<id>.path` appears as project-local without UI registration. Composition plugins may attach generic configuration metadata to activation children; `external-mcps` uses it for safe command, version, arguments and environment-name fields.

See the [complete Configuration Center guide](https://github.com/cartagogit/mcp-vertex/blob/main/docs/mcp-vertex/CONFIGURATION-CENTER.md).
