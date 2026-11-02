# @delendai/state-sqlite

SQLite-specific helpers for the delendai state engine.

## Use

Workspace-internal (`private`): it is consumed by other workspaces in this repository and is not published. Import from the package root or from `@delendai/state-sqlite/public`; see `AGENT.md` in this folder for the generated purpose, entry points and dependencies.

## Develop

```sh
bun run --cwd packages/state-sqlite test
bun run --cwd packages/state-sqlite build
```
