# Host checkpoint adapter contract

An adapter is optional glue around a host lifecycle boundary. It is never a
substitute for an agent creating an explicit checkpoint.

## Portable path for every host

1. The agent uses `memory_compact` with decisions, open work, facts and
   pointers; raw output and exploration stay out of the digest.
2. On a real resume or post-compaction boundary, the host (or the agent)
   invokes `memory_checkpoint_packet`.
3. The agent continues from the bounded packet: digest, pointers and the next
   open action. If no packet is available, it starts a fresh concise digest
   rather than recovering raw history.

The packet is read-only and host-agnostic. It never receives a transcript,
host context count, subscription meter, credentials or an inferred lifecycle.

## Adapter acceptance checklist

- The host documents the exact lifecycle event it guarantees.
- The adapter is disabled until the user explicitly installs its configuration.
- The adapter passes no transcript path or secret-bearing environment data.
- A disconnected MCP server is non-blocking; the manual portable path remains
  usable.
- The adapter has a smoke test that proves both packet-present and
  packet-absent behavior.

Claude Code's ready-to-merge settings fragment is in
[`config/external/claude-code/`](../../../config/external/claude-code/).
