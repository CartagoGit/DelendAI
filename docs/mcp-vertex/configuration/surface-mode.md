# Surface Mode

This repo supports three tool-surface strategies:

- native: expose the full static tool list up front.
- adaptive: expose the bootstrap surface first, then activate more tools when the client supports tools/list_changed.
- compact: expose the vertex router instead of the full tool surface.

The reproducible benchmark for the default decision lives in docs/mcp-vertex/configuration/surface-mode-decision.yaml and is regenerated with bun tools/scripts/bench/surface-mode-compare.bench.script.ts.

Until the default is switched in the runtime, use an explicit surface override when you need deterministic measurements:

```bash
bun tools/scripts/test/run-actual-preset-budget.script.ts --surface=native swarm
bun tools/scripts/test/run-actual-preset-budget.script.ts --surface=adaptive --dynamic-client swarm
```