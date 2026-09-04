# @delendai/project-health

Compact **project health** plugin for
[`@delendai/core`](../../packages/core). It exposes one bounded
`project_health` tool that returns a cheap summary first and lazy domain
details on demand.

## Load it

```bash
mcp-vertex --plugins=project-health
```

This registers one tool, `<prefix>_project_health`.

## Tool: `<prefix>_project_health`

| Input | Type | Default |
| --- | --- | --- |
| `domain` | `'summary' \| 'security' \| 'deps' \| 'quality' \| 'debt'` | `'summary'` |

The summary mode returns `score`, per-domain scores, `next`, `bytes`, and a
`truncated` marker. Detail modes stay lazy: they do not run the heavy scanners;
instead they point to the real tool that should be called next.

## Configuration (`mcp-vertex.config.json`)

```json
{
  "plugins": {
    "project-health": {
      "options": {
        "maxBytes": 2000
      }
    }
  }
}
```

The summary intentionally uses only cheap heuristics: lockfile/config presence,
bounded file sampling, and bounded debt-marker scans. Detailed scanners remain
owned by the underlying plugins.