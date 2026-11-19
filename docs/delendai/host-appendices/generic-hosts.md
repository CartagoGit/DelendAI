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
- Save a fact or rule about this project in the host's project-scoped
  memory, never in a memory shared by every project.

When you wait on long work, start the command (deliver, prove, publish) once, in
the host's background mechanism, and wait for its completion notification. Never poll
and never use a pattern that can match the waiter itself. Never start a second deliver
of the same unit. Leave no waiter behind when you report. A host with no completion
notification gets one blocking call with a timeout, never a loop (see the work unit
playbook).
