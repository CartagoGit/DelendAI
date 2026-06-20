# IDE Extension

The VS Code extension is the first IDE host for `mcp-vertex`.

It uses `@mcp-vertex/client` to connect to a local MCP server over stdio and
surfaces the live registry in the editor:

- tool tree: server, plugins and tools;
- proposal board tree;
- command palette entries for overview, refresh, validation, proposals and
  metrics;
- status bar summary;
- simple webviews for JSON and metrics.

## Troubleshooting

If the extension cannot connect, run the server command manually from the
workspace root:

```sh
bun run mcp-vertex
```

Then run:

```sh
cd apps/vscode
bun run type
bun run test
bun run package
```
