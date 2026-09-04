# @delendai/adaptive-optimizer

Bounded adaptive-optimizer plugin for
[@delendai/core](../../packages/core). It exposes one compact
optimize_run tool that ranks candidate model/plugin/prompt configurations
without spending money or launching heavy experiments unless a host wires an
explicit optional path on top.

## Load it

```bash
mcp-vertex --plugins=adaptive-optimizer
```

This registers one tool, `<prefix>_optimize_run`.

## Tool: `<prefix>_optimize_run`

| Input | Type | Default |
| --- | --- | --- |
| `task` | `string` | omitted |
| `candidates` | `Array<{ id, model?, pluginSet?, prompt?, toolDescription?, permissions?, signals? }>` | required |
| `budget` | `number` | required |
| `consent` | `boolean` | required |

The tool is intentionally cheap by default. It reuses public ranking/scoring
surfaces from auto-agent-selector, auto-plugin-selector and usage-tracking,
and it only feature-detects prompt-eval/perf optional experiment hooks. By
default it does not run the full eval harness or a real profiler capture.

The result always includes `ranked`, `budget`, `consent`, `bytes`, and
`truncated`.

## Configuration (`mcp-vertex.config.json`)

```json
{
  "plugins": {
    "adaptive-optimizer": {
      "options": {
        "maxBytes": 2000
      }
    }
  }
}
```