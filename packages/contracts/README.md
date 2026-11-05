# @delendai/contracts

Pure-TypeScript type-only contracts shared across the delendai ecosystem. NO Node imports, NO @delendai/core dependency. Plugins and external consumers can depend on this package without dragging in the runtime weight of `@delendai/core`.

## Use

Published as `@delendai/contracts`. Import from the package root or from `@delendai/contracts/public`; see `AGENT.md` in this folder for the generated purpose, entry points and dependencies.

## Develop

```sh
bun run --cwd packages/contracts test
bun run --cwd packages/contracts build
```
