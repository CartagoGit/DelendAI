# Codex adapter pack

The checked-in project configuration at [`.codex/config.toml`](../../../.codex/config.toml)
connects Codex to the repository-local mcp-vertex server. That MCP connection
is the complete portable baseline: it exposes the live tools, prompts and
resources selected by the server configuration, without maintaining a copied
tool list in Codex instructions.

Codex also reads the repository bootstrap through `AGENTS.md`, so durable
workflow guidance is a workspace-file capability. Native skills and plugins
remain host-managed additions; when unavailable, the connected MCP surface is
still sufficient to discover and use mcp-vertex capabilities.

Codex hooks can observe lifecycle events, including turn stop, but a hook is
not a license for mcp-vertex to restart a completed Codex response. This pack
therefore declares manual continuation by default: persist a bounded handoff
and begin the next host turn from it. A future Codex automation may opt into a
`host-loop` profile only when it owns a documented runner that can safely start
the next turn, bound retries and stop on locks, validation failures or no work.

This is the same adapter contract used by every other host: MCP is required;
instructions, native skills, lifecycle and automatic continuation are explicit
capabilities rather than assumptions about a provider.
