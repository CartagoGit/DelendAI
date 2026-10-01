# Modular adoption modes

The bootstrap planner never needs to overwrite an existing MCP integration by
inference. Call `analyze_project` or `plan_mcp_project` with an explicit
`adoption` choice when the default is not what you want.

## Replace

```json
{ "adoption": { "mode": "replace" } }
```

Generates a complete host layout, including MCP/editor configuration. On an
existing MCP project the result carries
`requiresExplicitReplacementConsent: true`; review it before writing files.

## Augment

```json
{ "adoption": { "mode": "augment" } }
```

Merges recommended capabilities while preserving the current MCP config,
agents, skills and proposal workflow. Existing projects default to this mode.

## Selected capabilities

```json
{
  "adoption": {
    "mode": "partial",
    "selectedCapabilities": ["tools", "skills"]
  }
}
```

Only selected collections are planned. Every other capability receives a
`preserve` operation, so it cannot appear accidentally in generated files.

## Bounded planning

Use `{ "compact": true }` for the summary. Add one `section` plus `cursor` and
`limit` to page tools, prompts, skills, agents, files or notes. File bodies are
only materialized when the `files` section is requested.

`targetDir` overrides the derived package root. Existing consumers default to
their repository root; the delendai self-host resolves to `packages/core`
with the `delendai` namespace.
