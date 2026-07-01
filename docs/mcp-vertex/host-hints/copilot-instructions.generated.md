<!-- Auto-generated discovery fragment for GitHub Copilot Chat. -->
<!-- Regenerate with `bun run catalog:hints`. Do not edit by hand. -->

<!-- BEGIN GENERATED: f00056 S4 (agnostic bootstrap). -->

## Discovery

Follow the universal bootstrap at
[`docs/mcp-vertex/AGENT-BOOTSTRAP.md`](docs/mcp-vertex/AGENT-BOOTSTRAP.md). The canonical first move is
`mcp-vertex_overview { compact: true }` followed by
`mcp-vertex_agent_catalog` whenever routing to a tool, skill, or
actionable proposal.

## Host-specific footnote

- Bootstrap appendix 8.1 (Copilot close-marker contract) is in effect.
<!-- END GENERATED: f00056 S4 (agnostic bootstrap). -->

> This fragment is intentionally minimal. The universal agent rules live
> in [`docs/mcp-vertex/AGENT-BOOTSTRAP.md`](docs/mcp-vertex/AGENT-BOOTSTRAP.md). Host files reference that
> file and add only the rules the server cannot enforce (e.g. the
> status-marker close contract on Copilot, the keep-main-thread-cheap
> rule on Claude Code). Tools, skills, and proposal ids are NEVER
> enumerated here — they are served live by `mcp-vertex_agent_catalog`.
