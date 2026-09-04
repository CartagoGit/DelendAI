# @delendai/quality-policy

Bounded quality-policy plugin for
[@delendai/core](../../packages/core). It exposes one compact
quality_policy tool that answers, in one payload, how the workspace expects
tests, conventions, lint, types and coverage to behave.

## Load it

```bash
mcp-vertex --plugins=quality-policy
```

This registers one tool, `<prefix>_quality_policy`.

## Tool: `<prefix>_quality_policy`

| Input | Type | Default |
| --- | --- | --- |
| `area` | `'tests' \| 'conventions' \| 'lint' \| 'types' \| 'coverage'` | omitted (all) |

The tool is intentionally policy-only: it reuses cheap public helpers from
quality, rules, test-policy, test-convention and conventions, and falls back
to bounded config/file heuristics where a richer answer would require running
heavy scanners or quality commands.

It does not execute `runAllScopes`, `scanDrift`, `run_quality`, or any other
runner. The response always includes `dependsOn`, `bytes`, and `truncated`.

## Configuration (`mcp-vertex.config.json`)

```json
{
  "plugins": {
    "quality-policy": {
      "options": {
        "maxBytes": 2000
      }
    }
  }
}
```