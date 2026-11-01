# View the Overview

The **Overview** command gives you a compact map of everything the MCP server
has loaded in one call:

- **Plugins** — which capability modules are active
- **Tools** — every tool registered, grouped by plugin
- **Knowledge** — available knowledge entries for lazy loading

## Why it matters

A single `overview { compact: true }` call costs ~318 tokens — **85% cheaper**
than probing the server tool by tool. It is the recommended first action in
every session.
