# @delendai/perf

Performance-budget plugin for [`@delendai/core`](../../packages/core).

## Tools

- **`perf_bundle`** — measure build-output size and return normalized findings.
  Matches files by `globs` (default `dist/**/*.js`) and flags any file over
  `maxFileKb` (`file-over-budget` — high when >2× the budget, else medium) and a
  total over `maxTotalKb` (`total-over-budget`, high). With no budgets it just
  reports sizes, largest first. Wire it into CI to fail the build when a bundle
  crosses its budget.
- **`perf_profile`** — probe for a profiler toolchain, run a short bounded
  capture against the workspace and return normalized hotspots plus a
  summary/worst band suitable for metrics-style gates. If no profiler is on
  PATH, the tool returns `ok: 'skipped'` with an install hint instead of
  crashing.

Offline, pure. The budget check is a pure function (exported from
`@delendai/perf/public`) over an injected sizer.

## Profiling

Example:

```json
{
  "tool": "mcp_perf_profile",
  "arguments": {
    "cwd": "/workspace",
    "timeoutMs": 4000,
    "format": "hotspots"
  }
}
```

The tool probes `node --prof`, `0x` and `clinic` in a deterministic order and
normalizes the best available capture into hotspot rows. `format: "flamegraph"`
still returns normalized hotspots today; it only changes profiler preference.
When nothing suitable is installed, the response is a graceful skip with an
install hint, never a crash.

## Load

```bash
delendai --plugins=perf
```

## License

BSD-3-Clause © Cartago
