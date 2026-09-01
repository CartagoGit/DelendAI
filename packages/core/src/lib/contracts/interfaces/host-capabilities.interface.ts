/**
 * Host-neutral capabilities used to build mcp-vertex adapter packs.
 *
 * MCP guarantees the live tool/prompt/resource transport. Native skills,
 * durable instructions, lifecycle hooks and automatic continuation are host
 * features, so they are declared rather than inferred from a provider name.
 */

/** How an adapter can provide durable project instructions to its host. */
export type THostInstructionCapability = 'none' | 'workspace-file' | 'prompt';

/** How an adapter can expose reusable skills beyond the MCP baseline. */
export type THostSkillCapability = 'none' | 'native' | 'mcp-tool';

/** Lifecycle observability/automation exposed by the host to an adapter. */
export type THostLifecycleCapability = 'none' | 'observe' | 'hooks';

/**
 * Whether a host can continue work after a response without a new user turn.
 * `manual` means the pack must provide a safe handoff instead of pretending it
 * can restart the host. `host-loop` is an adapter-owned capability, never an
 * MCP-server side effect.
 */
export type THostContinuationCapability = 'manual' | 'host-loop';

/** Declarative capabilities of one host adapter. */
export interface IHostCapabilities {
	/** Every adapter pack requires this MCP baseline. */
	readonly mcp: {
		readonly tools: boolean;
		readonly prompts: boolean;
		readonly resources: boolean;
	};
	readonly instructions: THostInstructionCapability;
	readonly skills: THostSkillCapability;
	readonly lifecycle: THostLifecycleCapability;
	readonly continuation: THostContinuationCapability;
}

/** A host identity plus its declared, provider-neutral capabilities. */
export interface IHostCapabilityProfile {
	/** Stable adapter id owned by the integration layer, not core policy. */
	readonly id: string;
	readonly capabilities: IHostCapabilities;
}
