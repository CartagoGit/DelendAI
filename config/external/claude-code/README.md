# Claude Code lifecycle adapters

`session-hygiene.hooks.json` is an **opt-in settings fragment** for Claude
Code. Merge its `hooks` object into the project's `.claude/settings.json` or
your user-level `~/.claude/settings.json`; it is not a second settings file to
load by itself.

It records four Claude lifecycle events through a local command hook: a user
turn, before/after compaction, and session end. Each row contains only an
opaque Claude session id, event kind and timestamp. It never records prompts,
transcript paths, model output, context size, or quota. Because command-hook
stdout is not returned to Claude, the turn counter has no per-turn MCP context
tax.

After a manual or automatic compaction it also calls the connected
`mcp-vertex` server's bounded checkpoint-packet tool. The returned packet has
only the last explicit digest, useful pointers and the next open action.

Prerequisites:

- Register the MCP server under the `mcp-vertex` name.
- Load the `memory` plugin.
- Load the `usage-tracking` plugin to read the optional local lifecycle
  report. With the default cache configuration, its log is written under
  `.cache/mcp-vertex/results/usage-tracking/`.
- Create an explicit digest with `memory_compact` before context pressure; a
  hook cannot safely create one from a private host transcript.

The fragment deliberately does not use `SessionStart`: Claude Code documents
that MCP servers can still be connecting there. It also does not use
`PreCompact` to create a digest: no hook receives the semantic working state
needed to make a truthful summary.

To smoke-test after merging, run Claude Code with `claude --debug hooks`, make
a small `memory_compact` checkpoint, send one user turn, then invoke
`/compact`. Confirm the `PostCompact` hook calls the bounded checkpoint tool
and the lifecycle log contains only `hostSessionId`, `event` and `at` metadata.
The hygiene report exposes host observations separately from MCP observations;
it marks an association only when the same session id was explicitly supplied
to both channels. A boot-scoped MCP id is not a Claude conversation id.

If the MCP server is configured with a non-default `cacheDir`, set the command
hook's `--lifecycle-path` to the corresponding path inside the project. The
script rejects absolute and escaping destinations, and telemetry write failures
are intentionally non-blocking.
