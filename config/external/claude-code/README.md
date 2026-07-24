# Claude Code lifecycle adapters

`session-hygiene.hooks.json` is an **opt-in settings fragment** for Claude
Code. Merge its `hooks` object into the project's `.claude/settings.json` or
your user-level `~/.claude/settings.json`; it is not a second settings file to
load by itself.

It runs after a manual or automatic compaction and calls the connected
`mcp-vertex` server's bounded checkpoint-packet tool. The returned packet has
only the last explicit digest, useful pointers and the next open action.

Prerequisites:

- Register the MCP server under the `mcp-vertex` name.
- Load the `memory` plugin.
- Create an explicit digest with `memory_compact` before context pressure; a
  hook cannot safely create one from a private host transcript.

The fragment deliberately does not use `SessionStart`: Claude Code documents
that MCP servers can still be connecting there. It also does not use
`PreCompact` to create a digest: no hook receives the semantic working state
needed to make a truthful summary.

To smoke-test after merging, run Claude Code with `claude --debug hooks`, make
a small `memory_compact` checkpoint, then invoke `/compact`. Confirm the
`PostCompact` hook calls `mcp-vertex_memory_checkpoint_packet` and does not
include a transcript path or secret in its input.
