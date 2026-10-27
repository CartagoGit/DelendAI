import type { IHostCapabilityProfile } from '../contracts/interfaces/host-capabilities.interface';
import {
	buildHostCapabilityPlan,
	type IHostCapabilityAction,
} from './host-capability-profile';

/** A concrete, serializable action an adapter applies to its own host. */
export interface IHostAdapterPackAction {
	readonly kind:
		| 'connect-mcp'
		| 'load-instructions'
		| 'install-skills'
		| 'configure-lifecycle'
		| 'continue-work';
	readonly mode: string;
	readonly required: boolean;
}

/**
 * A deterministic adapter-pack manifest. It intentionally contains no host
 * paths or vendor syntax: the thin host adapter maps these actions to its
 * native configuration file, command or lifecycle hook.
 */
export interface IHostAdapterPack {
	readonly version: 1;
	readonly hostId: string;
	readonly actions: readonly IHostAdapterPackAction[];
	readonly continuation: {
		readonly mode: 'manual' | 'host-loop';
		readonly requiresHostRunner: boolean;
		readonly fallback: 'handoff-and-new-turn' | 'adapter-owned-loop';
	};
}

const actionFor = (action: IHostCapabilityAction): IHostAdapterPackAction => {
	switch (action.capability) {
		case 'mcp':
			return { kind: 'connect-mcp', mode: action.mode, required: true };
		case 'instructions':
			return {
				kind: 'load-instructions',
				mode: action.mode,
				required: false,
			};
		case 'skills':
			return {
				kind: 'install-skills',
				mode: action.mode,
				required: false,
			};
		case 'lifecycle':
			return {
				kind: 'configure-lifecycle',
				mode: action.mode,
				required: false,
			};
		case 'continuation':
			return {
				kind: 'continue-work',
				mode: action.mode,
				required: false,
			};
	}
};

/**
 * Generate the portable manifest consumed by every concrete host adapter.
 * A manual-continuation pack contains an explicit handoff action instead of
 * a fictitious background runner; a host-loop pack says that the adapter, not
 * the MCP server, owns the loop.
 */
export const buildHostAdapterPack = (
	profile: IHostCapabilityProfile,
): IHostAdapterPack => {
	const plan = buildHostCapabilityPlan(profile);
	return {
		version: 1,
		hostId: plan.hostId,
		actions: [
			...plan.baseline.map(actionFor),
			...plan.optional.map(actionFor),
			{
				kind: 'continue-work',
				mode: plan.continuation.mode,
				required: false,
			},
		],
		continuation: {
			mode: plan.continuation.mode,
			requiresHostRunner: plan.continuation.mode === 'host-loop',
			fallback: plan.continuation.fallback,
		},
	};
};
