# @mcp-vertex/perf

Performance-budget plugin for [`@mcp-vertex/core`](../../packages/core).

## Tools

- **`perf_bundle`** — measure build-output size and return normalized findings.
  Matches files by `globs` (default `dist/**/*.js`) and flags any file over
  `maxFileKb` (`file-over-budget` — high when >2× the budget, else medium) and a
  total over `maxTotalKb` (`total-over-budget`, high). With no budgets it just
  reports sizes, largest first. Wire it into CI to fail the build when a bundle
  crosses its budget.

Offline, pure. The budget check is a pure function (exported from
`@mcp-vertex/perf/public`) over an injected sizer.

## Load

```bash
mcp-vertex --plugins=perf
```

## License

BSD-3-Clause © Cartago
