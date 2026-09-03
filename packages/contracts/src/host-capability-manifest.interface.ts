/**
 * Canonical, host-owned MCP capability declaration.
 *
 * This contract describes what a connected host can consume. It deliberately
 * does not describe tool effects or plugin permissions: those remain the
 * `ICapabilitySet`/plugin-manifest contracts owned by the runtime. A host
 * being able to receive a tool is not authorization to execute its effects.
 */

/** Stable discriminator for persisted or exchanged host manifests. */
export const HOST_CAPABILITY_MANIFEST_CONTRACT =
	'mcp-vertex.host-capability-manifest' as const;

/** Current schema version for {@link IHostCapabilityManifest}. */
export const HOST_CAPABILITY_MANIFEST_VERSION = 1 as const;

/** A host-native capability or an equivalent MCP-backed integration. */
export type THostSurfaceSupport = 'none' | 'native' | 'mcp-tool';

/** Capabilities negotiated on the MCP transport. */
export interface IHostMcpCapabilities {
	/** Every mcp-vertex host must be able to list and invoke tools. */
	readonly tools: boolean;
	/** Whether the host can consume MCP prompts. */
	readonly prompts: boolean;
	/** Whether the host can consume MCP resources. */
	readonly resources: boolean;
	/** Whether the host understands typed `structuredContent` results. */
	readonly structuredContent: boolean;
	/** Whether the host can receive `list_changed` notifications. */
	readonly listChanged: boolean;
	/** Whether the host can receive server notifications. */
	readonly notifications: boolean;
}

/** Capability names accepted by a host registry query. */
export type THostCapabilityKey =
	| 'tools'
	| 'prompts'
	| 'resources'
	| 'structuredContent'
	| 'listChanged'
	| 'notifications'
	| 'skills'
	| 'subagents';

/** A host adapter's view, checked against the canonical manifest by the lint. */
export interface IHostCapabilityProjection {
	readonly hostId: string;
	readonly mcp: IHostMcpCapabilities;
	readonly skills: THostSurfaceSupport;
	readonly subagents: THostSurfaceSupport;
}

/**
 * The one canonical declaration for the host surface.
 *
 * `skills` and `subagents` use a mode instead of a boolean so a projection
 * cannot confuse a native integration with the MCP fallback. The registry's
 * `supportsX()` helpers are views over this object, never another source of
 * host capability truth.
 */
export interface IHostCapabilityManifest {
	readonly contract: typeof HOST_CAPABILITY_MANIFEST_CONTRACT;
	readonly version: typeof HOST_CAPABILITY_MANIFEST_VERSION;
	/** Stable kebab-case integration identifier. */
	readonly hostId: string;
	readonly mcp: IHostMcpCapabilities;
	readonly skills: THostSurfaceSupport;
	readonly subagents: THostSurfaceSupport;
}
