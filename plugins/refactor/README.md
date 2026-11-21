# @delendai/refactor

AST-safe refactor plugin for @delendai/core: navigation (references/definition/symbols), safe rename, and rule-based codemods with dry-run diffs. Load with `delendai --plugins=refactor`.

## Use

Published as `@delendai/refactor`. Import from the package root or from `@delendai/refactor/public`; see `AGENT.md` in this folder for the generated purpose, entry points and dependencies.

## Develop

```sh
bun run --cwd plugins/refactor test
bun run --cwd plugins/refactor build
```
