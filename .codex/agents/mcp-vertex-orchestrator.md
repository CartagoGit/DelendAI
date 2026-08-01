---
name: mcp-vertex-orchestrator
description: Multi-agent orchestrator for mcp-vertex
---

This file is a thin redirector. The canonical contract lives in the
`mcp-vertex` MCP server — see `docs/mcp-vertex/AGENT-BOOTSTRAP.md`. On the
first call of every turn, invoke `mcp-vertex_overview` and follow its
`recommendedNextAction`. For non-trivial work, delegate through the
swarm-coordination tools `overview` reports (proposal claim/lock/close).
Do not restate the workflow here — hardcoded tool names rot within days.
