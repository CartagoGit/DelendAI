# @delendai/execution-env

Execution environments for @delendai/core: one contract and registry for running commands locally, in Docker, Docker Compose, over SSH or inside an existing container.

## Use

Published as `@delendai/execution-env`. Import from the package root or from `@delendai/execution-env/public`; see `AGENT.md` in this folder for the generated purpose, entry points and dependencies.

## Develop

```sh
bun run --cwd plugins/execution-env test
bun run --cwd plugins/execution-env build
```
