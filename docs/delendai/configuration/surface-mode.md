# Surface Mode

This repo supports four tool-surface strategies:

- native: expose the full static tool list up front.
- managed: the default; expose a stable bootstrap surface and route the rest internally.
- adaptive: expose the bootstrap surface first, then activate more tools when explicitly requested.
- compact: expose the vertex router instead of the full tool surface.

The reproducible benchmark lives in
`docs/delendai/configuration/surface-mode-decision.yaml` and is regenerated
with `bun tools/scripts/bench/surface-mode-compare.bench.script.ts`.

Use an explicit surface override when you need deterministic measurements:

```bash
bun tools/scripts/test/run-actual-preset-budget.script.ts --surface=native swarm
bun tools/scripts/test/run-actual-preset-budget.script.ts --surface=adaptive --dynamic-client swarm
```
