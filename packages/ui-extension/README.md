# @delendai/ui-extension

Host-agnostic UI shell (dashboard, panels, command palette, brand assets) consumed by every @delendai extension host (vscode today; jetbrains, zed, cursor, antigravity tomorrow). Pure HTML + CSS + vanilla JS, no host imports.

## Use

Workspace-internal (`private`): it is consumed by other workspaces in this repository and is not published. Import from the package root or from `@delendai/ui-extension/public`; see `AGENT.md` in this folder for the generated purpose, entry points and dependencies.

## Develop

```sh
bun run --cwd packages/ui-extension test
bun run --cwd packages/ui-extension build
```
