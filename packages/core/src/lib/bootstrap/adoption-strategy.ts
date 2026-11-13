import type { z } from 'zod';

import {
	ADOPTION_CAPABILITY_SCHEMA,
	type ADOPTION_MODE_SCHEMA,
	ADOPTION_STRATEGY_INPUT_SCHEMA,
	ADOPTION_STRATEGY_SCHEMA,
} from '../contracts/constants/adoption-strategy-schema.constant';

type AdoptionCapability = z.infer<typeof ADOPTION_CAPABILITY_SCHEMA>;
type AdoptionMode = z.infer<typeof ADOPTION_MODE_SCHEMA>;

interface IAdoptionContext {
	readonly hasExistingMcpProject: boolean;
}

const ALL_CAPABILITIES = ADOPTION_CAPABILITY_SCHEMA.options;
const PRESERVATION_SENSITIVE = new Set<AdoptionCapability>([
	'agents',
	'skills',
	'mcp-config',
	'proposal-workflow',
]);

const uniqueCapabilities = (
	capabilities: readonly AdoptionCapability[],
): readonly AdoptionCapability[] =>
	ALL_CAPABILITIES.filter((capability) => capabilities.includes(capability));

const defaultMode = (context: IAdoptionContext): AdoptionMode =>
	context.hasExistingMcpProject ? 'augment' : 'replace';

/**
 * Resolve the user's adoption choice into one deterministic per-capability
 * policy. Existing coordination/configuration surfaces are merge-only unless
 * the caller explicitly chooses a whole-project replacement.
 */
export const resolveAdoptionStrategy = (
	input: unknown,
	context: IAdoptionContext,
) => {
	const parsed = ADOPTION_STRATEGY_INPUT_SCHEMA.parse(input);
	const mode = parsed.mode ?? defaultMode(context);
	if (
		mode === 'partial' &&
		(parsed.selectedCapabilities?.length ?? 0) === 0
	) {
		throw new Error(
			'partial adoption requires at least one selected capability',
		);
	}
	if (mode !== 'partial' && parsed.selectedCapabilities !== undefined) {
		throw new Error(
			'selectedCapabilities is only valid when adoption mode is partial',
		);
	}
	const selectedCapabilities =
		mode === 'partial'
			? uniqueCapabilities(parsed.selectedCapabilities ?? [])
			: [...ALL_CAPABILITIES];
	const selected = new Set(selectedCapabilities);
	const operations = ALL_CAPABILITIES.map((capability) => ({
		capability,
		action: !selected.has(capability)
			? ('preserve' as const)
			: mode === 'replace'
				? ('replace' as const)
				: ('merge' as const),
	}));
	const protectedCapabilities = operations
		.filter(
			(operation) =>
				operation.action === 'preserve' ||
				(operation.action === 'merge' &&
					PRESERVATION_SENSITIVE.has(operation.capability)),
		)
		.map((operation) => operation.capability);
	return ADOPTION_STRATEGY_SCHEMA.parse({
		mode,
		selectedCapabilities,
		operations,
		protectedCapabilities,
		requiresExplicitReplacementConsent:
			context.hasExistingMcpProject && mode === 'replace',
	});
};
