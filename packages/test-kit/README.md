# @delendai/test-kit

Internal, test-only helpers shared across @delendai workspaces (never published). Home of the typed partial-fake helper that replaces `as unknown as T` casts in test files.

## Use

Workspace-internal (`private`): it is consumed by other workspaces in this repository and is not published. Import from the package root or from `@delendai/test-kit/public`; see `AGENT.md` in this folder for the generated purpose, entry points and dependencies.

## Develop

```sh
bun run --cwd packages/test-kit test
bun run --cwd packages/test-kit build
```
