# Bootstrap surface

The non-native surface bootstrap is reduced to the minimum set that allows orientation, discovery, activation, and routing without paying for the full catalog on the first `listTools`.

The current bootstrap tools are:

- overview
- tool_search
- plugin_activate
- plugin_deactivate
- status
- vertex

The rest of the surface is exposed according to the mode resolved for the client. In automatic negotiation, the server boots in a minimal bootstrap and decides the final mode after the client's MCP handshake.

Local measurement lives in `tools/scripts/measure/bootstrap.script.ts`. The script prints bytes and a rough token estimate for native, adaptive, and compact, and fails if adaptive exceeds 50 KB.