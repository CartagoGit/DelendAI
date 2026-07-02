/**
 * resolved-host-identity.interface.ts — f00082 S3.
 *
 * NOTE: named `IResolvedHostIdentity` (not `IHostIdentity`) because the
 * host-config contract already owns a different `IHostIdentity` (server
 * name / version / namespace). This one is the boot-resolved AGENT identity.
 *
 * The boot-resolved identity of the host driving this mcp-vertex process:
 * which client/IDE (`host`) and which model (`model`). It is resolved ONCE
 * at assembly time from the same source as the commit-author policy
 * (`mcp-vertex.config.json#commitAuthor` or the `agent-client` / `agent-model`
 * programmatic args) and handed to every plugin on {@link IMcpPluginContext}.
 *
 * Plugins that record who did a piece of work (the proposals swarm registry)
 * read this as the DEFAULT identity when a per-call `host`/`model` argument is
 * absent — so an orchestrator that declares itself once at boot no longer has
 * to repeat its identity on every tool call.
 *
 * Both fields are optional: the context carries a `hostIdentity` only when the
 * host actually declared one. When neither is provided, the field is omitted
 * entirely and consumers keep their pre-existing `null`/legacy fallback
 * (behaviour is byte-identical to before this contract existed).
 *
 * The values are the RAW resolved strings (e.g. `host: 'copilot'`); a consumer
 * that needs a constrained shape (e.g. the proposals `AgentHost` union) coerces
 * them itself — the core stays free of that domain vocabulary.
 */
export interface IResolvedHostIdentity {
	/** Client / IDE driving the agent (e.g. `copilot`, `claude-code`). */
	readonly host?: string;
	/** Active model (e.g. `m3`, `claude-3-5-sonnet`). */
	readonly model?: string;
}
