# Cursor / Aider / Continue — generic LLM hosts

> The appendix of [`AGENT-BOOTSTRAP.md`](../AGENT-BOOTSTRAP.md) for this host. Read it with the bootstrap; no other host reads it.

These hosts typically read a workspace-root `AGENTS.md` (Cursor, Aider)
or have their own config file. Use the same single-pointer pattern:

- Place an `AGENTS.md` (or the host's equivalent config file) at the
  workspace root whose entire content is:

  ````text
  # Agent instructions

  Follow [`docs/delendai/AGENT-BOOTSTRAP.md`](docs/delendai/AGENT-BOOTSTRAP.md)
  — that file is the only source of agent rules. The server
  (`delendai_overview`, `delendai_agent_catalog`) is the only source
  of truth for what is loaded. Do not enumerate tools, skills, or
  proposal ids in your answers.
  ````

- That's it. No other content. When the bootstrap changes, the host
  picks it up on the next session.
