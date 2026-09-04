# @delendai/impact-analysis

Bounded impact-analysis plugin for
[@delendai/core](../../packages/core). It exposes two tools:
impact analysis for a change slice and focused test selection for that slice.

## Load it

```bash
mcp-vertex --plugins=impact-analysis
```

This registers two tools, `<prefix>_impact_analyze` and
`<prefix>_tests_for_change`.

## Tools

`<prefix>_impact_analyze`

- Input: `files?: string[]`, `gitDiff?: string`, `symbols?: string[]`
- Output: `changedSymbols`, `dependents`, `affectedPackages`,
  `recommendedTests`, `risk`, `dependsOn`, `bytes`, `truncated`

`<prefix>_tests_for_change`

- Input: `files?: string[]`, `symbols?: string[]`
- Output: `run`, `skip`, `coverageFocus`, `likelyRelatedFailures`, `bytes`,
  `truncated`

Both tools stay within a bounded byte budget and truncate deterministically
when the payload would exceed the configured limit.

## Configuration (`mcp-vertex.config.json`)

```json
{
  "plugins": {
    "impact-analysis": {
      "options": {
        "maxBytes": 3000
      }
    }
  }
}
```