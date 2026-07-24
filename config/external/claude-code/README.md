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

Before compaction, the fragment asks a small read-only checkpoint advisory
whether the latest explicit digest is missing, fresh, or stale. It examines
only the digest timestamp and never writes a summary. When it asks for a
semantic checkpoint, the active agent must create it deliberately with its
actual work state; a hook cannot do that truthfully.

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
`/compact`. Confirm the `PreCompact` hook returns the small checkpoint
advisory and the `PostCompact` hook calls the bounded checkpoint tool
and the lifecycle log contains only `hostSessionId`, `event` and `at` metadata.
The hygiene report exposes host observations separately from MCP observations;
it marks an association only when the same session id was explicitly supplied
to both channels. A boot-scoped MCP id is not a Claude conversation id.

If the MCP server is configured with a non-default `cacheDir`, set the command
hook's `--lifecycle-path` to the corresponding path inside the project. The
script rejects absolute and escaping destinations, and telemetry write failures
are intentionally non-blocking.

## Universal adapter profile

Claude Code receives the same live MCP baseline as every compatible host. Its
workspace instructions and native skills are optional host capabilities; the
hook fragment is an optional lifecycle capability. None of those additions
changes which mcp-vertex tools, prompts or resources the connected server
exposes.

This adapter records and advises at documented lifecycle boundaries but does
not restart a completed Claude turn. It therefore uses the portable manual
continuation fallback: persist a bounded handoff, then let the next real host
turn consume it. Only an adapter that owns a documented, bounded host runner
may declare automatic `host-loop` continuation.
