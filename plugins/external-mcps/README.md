# @delendai/external-mcps

Compose third-party MCP servers under an @delendai/core host: seed-catalog discovery, LLM-assisted config validation with mandatory version pins, and (later slices) lazy subprocess boot with human-acked activation. Load with `delendai --plugins=external-mcps`.

## Use

Published as `@delendai/external-mcps`. Import from the package root or from `@delendai/external-mcps/public`; see `AGENT.md` in this folder for the generated purpose, entry points and dependencies.

## Develop

```sh
bun run --cwd plugins/external-mcps test
bun run --cwd plugins/external-mcps build
```
