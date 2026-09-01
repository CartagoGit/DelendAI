import type { PermissionCategory } from '../contracts/constants/permission-categories.constant';
import type {
	IPresetBudgetProfile,
	IPresetMetadataEntry,
} from '../contracts/interfaces/preset-budget-profile.interface';
import { FIRST_PARTY_PLUGIN_INDEX } from '../registry/first-party-index';

const pluginById = new Map(
	FIRST_PARTY_PLUGIN_INDEX.entries.map((entry) => [entry.id, entry] as const),
);

const titleCase = (value: string): string =>
	value
		.split('-')
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join(' ');

const deriveCapabilities = (
	pluginIds: readonly string[],
): readonly string[] => {
	const ids = new Set(pluginIds);
	const capabilities: string[] = [];
	if (ids.has('git') || ids.has('search')) {
		capabilities.push('orientation');
	}
	if (ids.has('memory')) {
		capabilities.push('session-memory');
	}
	if (
		[
			'rules',
			'quality',
			'refactor',
			'test-policy',
			'test-convention',
			'conventions',
		].some((id) => ids.has(id))
	) {
		capabilities.push('quality-gates');
	}
	if (
		['docs', 'diagram', 'link-check', 'skills-pack', 'prompts-pack'].some(
			(id) => ids.has(id),
		)
	) {
		capabilities.push('documentation');
	}
	if (
		[
			'database',
			'container',
			'deps',
			'env',
			'perf',
			'project-health',
			'impact-analysis',
		].some((id) => ids.has(id))
	) {
		capabilities.push('analysis');
	}
	if (
		[
			'proposals',
			'notification',
			'completion',
			'logs',
			'status-marker',
		].some((id) => ids.has(id))
	) {
		capabilities.push('multi-agent-coordination');
	}
	if (
		[
			'forge',
			'web-fetch',
			'issues',
			'api',
			'adaptive-optimizer',
			'orchestrator-runner',
		].some((id) => ids.has(id))
	) {
		capabilities.push('automation');
	}
	return capabilities.length > 0 ? capabilities : ['general'];
};

const derivePermissions = (
	pluginIds: readonly string[],
): readonly PermissionCategory[] =>
	[
		...new Set(
			pluginIds.flatMap((id) => pluginById.get(id)?.permissions ?? []),
		),
	].sort();

export const derivePresetSummary = (input: {
	id: string;
	resolvedMembers: readonly string[];
	independent?: boolean;
}): string => {
	const preview =
		input.resolvedMembers.length <= 6
			? input.resolvedMembers.join(', ')
			: `${input.resolvedMembers.slice(0, 6).join(', ')}, +${input.resolvedMembers.length - 6} more`;
	const shape =
		input.independent === true ? 'Independent preset' : 'Chain preset';
	return `${shape} for ${titleCase(input.id)} with ${input.resolvedMembers.length} plugins: ${preview}.`;
};

export const derivePresetBudget = (input: {
	metadata: IPresetMetadataEntry;
	resolvedMembers: readonly string[];
}): IPresetBudgetProfile => ({
	surfaceMode: input.metadata.measurementSurface,
	runtimeSurface: input.metadata.runtimeSurface ?? 'managed',
	toolCount: {
		value: input.metadata.budgetBaseline.toolCount,
		source: 'measured-runtime',
		measuredAt: input.metadata.measuredAt,
	},
	schemaBytes: {
		value: input.metadata.budgetBaseline.schemaBytes,
		source: 'measured-runtime',
		measuredAt: input.metadata.measuredAt,
	},
	coldStartTokens: {
		value: input.metadata.budgetBaseline.coldStartTokens,
		source: 'estimated-from-schema-bytes',
		measuredAt: input.metadata.measuredAt,
		bytesPerEstimatedToken: input.metadata.bytesPerEstimatedToken,
		estimator: input.metadata.estimator,
	},
	permissions: {
		source: 'measured-tool-effects',
		values: derivePermissions(input.resolvedMembers),
	},
	capabilities: {
		source: 'role-profile',
		values: deriveCapabilities(input.resolvedMembers),
	},
});
