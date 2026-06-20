# mcp-vertex VS Code

VS Code client for a local `mcp-vertex` MCP server.

## Development

- `bun run type` checks the extension sources.
- `bun run test` runs the mock-based smoke and provider tests.
- `bun run build` bundles `src/extension.ts` to `dist/extension.js`.
- `bun run package` builds a local `.vsix`.

The extension talks to the server over stdio through `@mcp-vertex/client`;
it does not embed server runtime logic.

## Features

- Command palette entries for overview, refresh, validation, proposal board
  and metrics.
- Tool tree and proposal tree contributions.
- Status bar summary for tool/proposal counts.
- Webview renderers for overview, tool detail and metrics.
