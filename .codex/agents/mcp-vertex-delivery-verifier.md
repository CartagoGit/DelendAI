---
name: mcp-vertex-delivery-verifier
description: Acceptance and gates verifier
---

This file is a thin redirector. The canonical contract lives in the
`mcp-vertex` MCP server. On the first call of every turn, invoke
`mcp-vertex_overview` and follow its `recommendedNextAction` — it lists
the live quality-gate and proposal-review tools, which change often
enough that a hardcoded list here would go stale. Do not restate the
workflow here.
