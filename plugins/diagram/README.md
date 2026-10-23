# @delendai/diagram

Diagram generation plugin for [`@delendai/core`](../../packages/core).

## Tools

- **`diagram_deps`** — render the workspace's **internal dependency graph**
  (which workspace package depends on which) as a mermaid `flowchart LR`, plus
  the raw nodes/edges. Mermaid renders natively in the docs site and in
  artifacts, so the graph is instantly viewable. External dependencies are
  ignored.

Offline, pure, no external tools. The graph build + render are pure functions
(exported from `@delendai/diagram/public`) over an injected package reader.

## Load

```bash
delendai --plugins=diagram
```

## License

BSD-3-Clause © Cartago
