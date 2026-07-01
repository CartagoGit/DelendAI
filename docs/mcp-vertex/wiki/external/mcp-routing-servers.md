# MCP servers that do routing

**Class:** Routing exposed as MCP tools.

---

## Summary

The MCP protocol is the right surface for routing decisions: the
agent asks explicitly, gets a structured answer, and the call is
auditable. Three production examples exist today.

## OpenRouter MCP server

<https://openrouter.ai/docs/_mcp/server> — "For AI client integration
(Claude Code, Cursor, etc.), connect to the MCP server at
<https://openrouter.ai/docs/_mcp/server>." **The most direct example
of an LLM provider shipping its routing as MCP.**

## Portkey MCP server

`@portkey-ai/mcp-server` exposes the model catalog + governance as
MCP tools. Documented at <https://portkey.ai/docs/integrations/mcp>.

## DIY

Aider, Cursor, Continue, Cline all consume MCP servers — so a
routing MCP server can be plugged into any of them. **There is no
widely-adopted canonical "model router MCP server" as of 2026**;
most projects roll their own (e.g. `proposals_model` plugin in
`mcp-vertex` can be wired to delegate to OpenRouter).

## What we can borrow for Option D

- **OpenRouter's MCP server is the canonical "do this shape"
  precedent.** Our `<prefix>_advise_routing` and
  `<prefix>_format_handoff` tools follow the same pattern: explicit
  tool calls, structured I/O, auditable per call.
- **Portkey's MCP integration proves that the catalog itself
  belongs as a tool** (not just a static config). Exposing
  `<prefix>_provider_catalog` lets agents inspect the roster at
  runtime.
- **No canonical "model router MCP server"** means there's room for
  `mcp-vertex` to publish one. The proposed
  [`04-recommended-approach.md`](../04-recommended-approach.md) is
  small enough (~400 lines) that it could ship as a plugin others
  reuse — not just a `mcp-vertex`-internal tool.
