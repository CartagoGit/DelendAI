import type {
	IHostCapabilityProfile,
	THostContinuationCapability,
} from '../contracts/interfaces/host-capabilities.interface';

/** One integration action exposed by a host-neutral adapter pack. */
export interface IHostCapabilityAction {
	readonly capability:
		| 'mcp'
		| 'instructions'
		| 'skills'
		| 'lifecycle'
		| 'continuation';
	readonly mode: string;
	readonly required: boolean;
}

/**
 * The normalized plan every adapter pack consumes. `fallback` is always
 * explicit for continuation, preventing an MCP server from claiming it can
 * resume an unsupported host process.
 */
export interface IHostCapabilityPlan {
	readonly hostId: string;
	readonly baseline: readonly IHostCapabilityAction[];
	readonly optional: readonly IHostCapabilityAction[];
	readonly continuation: {
		readonly mode: THostContinuationCapability;
		readonly fallback: 'handoff-and-new-turn' | 'adapter-owned-loop';
	};
}

const assertProfile = (profile: IHostCapabilityProfile): void => {
	if (!/^[a-z][a-z0-9-]*$/u.test(profile.id)) {
		throw new Error('host capability profile id must be kebab-case');
	}
	if (profile.capabilities.mcp.tools !== true) {
		throw new Error('every host capability profile must expose MCP tools');
	}
};

/**
 * Convert declared host features into a deterministic integration plan.
 * MCP is always the required live baseline; all host-native behavior stays
 * optional and omitted when unavailable.
 */
export const buildHostCapabilityPlan = (
	profile: IHostCapabilityProfile,
): IHostCapabilityPlan => {
	assertProfile(profile);
	const { capabilities } = profile;
	const baseline: IHostCapabilityAction[] = [
		{ capability: 'mcp', mode: 'tools', required: true },
	];
	if (capabilities.mcp.prompts) {
		baseline.push({ capability: 'mcp', mode: 'prompts', required: true });
	}
	if (capabilities.mcp.resources) {
		baseline.push({ capability: 'mcp', mode: 'resources', required: true });
	}

	const optional: IHostCapabilityAction[] = [];
	if (capabilities.instructions !== 'none') {
		optional.push({
			capability: 'instructions',
			mode: capabilities.instructions,
			required: false,
		});
	}
	if (capabilities.skills !== 'none') {
		optional.push({
			capability: 'skills',
			mode: capabilities.skills,
			required: false,
		});
	}
	if (capabilities.lifecycle !== 'none') {
		optional.push({
			capability: 'lifecycle',
			mode: capabilities.lifecycle,
			required: false,
		});
	}

	return {
		hostId: profile.id,
		baseline,
		optional,
		continuation: {
			mode: capabilities.continuation,
			fallback:
				capabilities.continuation === 'host-loop'
					? 'adapter-owned-loop'
					: 'handoff-and-new-turn',
		},
	};
};
