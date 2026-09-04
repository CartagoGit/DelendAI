# Connect the MCP Server

The delendai extension communicates with an MCP server over stdio.
The server starts automatically when the extension activates.

## Check the Status Bar

Look for the **delendai** indicator in the bottom status bar. It shows:
- ✅ Connected — the server is running and tools are available
- ⚠️ Disconnected — the server failed to start

## Troubleshoot

If the server does not start:
1. Open the command palette (`Ctrl+Shift+P`)
2. Run **DelendAI: Restart MCP Server**
3. Check that `bun` is on your `PATH` (or configure `delendai.server.command` in settings)
