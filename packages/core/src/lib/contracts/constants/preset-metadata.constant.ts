import { TOKEN_BUDGETS } from './token-budgets.constant';
import type { IPresetMetadataEntry } from '../interfaces/preset-budget-profile.interface';

const PRESET_BUDGET_MEASURED_AT = '2026-08-24';

const RUNTIME_BUDGET_NOTE = {
	bytesPerEstimatedToken: TOKEN_BUDGETS.bytesPerEstimatedToken,
	measuredAt: PRESET_BUDGET_MEASURED_AT,
} as const;

const runtimeBudget = (
	toolCount: number,
	schemaBytes: number,
	coldStartTokens: number,
	permissions: readonly string[],
	capabilities: readonly string[],
) => ({
	toolCount: {
		value: toolCount,
		source: 'measured-runtime' as const,
		measuredAt: RUNTIME_BUDGET_NOTE.measuredAt,
	},
	schemaBytes: {
		value: schemaBytes,
		source: 'measured-runtime' as const,
		measuredAt: RUNTIME_BUDGET_NOTE.measuredAt,
	},
	coldStartTokens: {
		value: coldStartTokens,
		source: 'estimated-from-schema-bytes' as const,
		measuredAt: RUNTIME_BUDGET_NOTE.measuredAt,
		bytesPerEstimatedToken: RUNTIME_BUDGET_NOTE.bytesPerEstimatedToken,
	},
	permissions: {
		source: 'measured-tool-effects' as const,
		values: permissions,
	},
	capabilities: {
		source: 'role-profile' as const,
		values: capabilities,
	},
});

export const PRESET_METADATA = {
	minimal: {
		role: 'orientation',
		budget: runtimeBudget(
			29,
			48_254,
			12_064,
			['spawn', 'write'],
			['orientation', 'git-history', 'code-search'],
		),
	},
	lean: {
		role: 'habitual-work',
		budget: runtimeBudget(
			41,
			60_433,
			15_109,
			['destructive', 'spawn', 'write'],
			[
				'everyday-coding',
				'git-history',
				'code-search',
				'session-memory',
				'documentation',
			],
		),
	},
	standard: {
		role: 'adaptive-task-aware',
		budget: runtimeBudget(
			80,
			105_031,
			26_258,
			['destructive', 'network', 'spawn', 'write'],
			[
				'adaptive-single-agent',
				'quality-gates',
				'dependency-audit',
				'refactor',
				'database-inspection',
				'container-inspection',
				'env-validation',
			],
		),
	},
	swarm: {
		role: 'multi-agent',
		budget: runtimeBudget(
			143,
			205_387,
			51_347,
			['destructive', 'network', 'spawn', 'write'],
			[
				'multi-agent-coordination',
				'proposal-workflow',
				'notifications',
				'event-logs',
				'status-markers',
				'team-test-conventions',
			],
		),
	},
	full: {
		role: 'diagnostic',
		budget: runtimeBudget(
			150,
			212_421,
			53_106,
			['destructive', 'network', 'spawn', 'write'],
			[
				'host-diagnostics',
				'web-fetch',
				'issue-management',
				'api-mock',
				'changelog',
			],
		),
	},
	vertex: {
		role: 'mcp-vertex-dogfood',
		budget: runtimeBudget(
			160,
			270_807,
			67_702,
			['destructive', 'network', 'spawn', 'write'],
			[
				'orchestrator-routing',
				'security-audit',
				'perf-analysis',
				'usage-tracking',
				'link-and-doc-governance',
			],
		),
	},
	'web-app': {
		role: 'stack-pack-web',
		budget: runtimeBudget(
			81,
			104_508,
			26_127,
			['destructive', 'network', 'spawn', 'write'],
			[
				'frontend-quality',
				'i18n',
				'diagramming',
				'container-lint',
				'web-fetch',
			],
		),
	},
	'backend-api': {
		role: 'stack-pack-backend',
		budget: runtimeBudget(
			80,
			102_924,
			25_731,
			['destructive', 'network', 'spawn', 'write'],
			[
				'api-quality',
				'database-inspection',
				'container-lint',
				'env-validation',
				'dependency-audit',
			],
		),
	},
	'cli-tool': {
		role: 'stack-pack-cli',
		budget: runtimeBudget(
			50,
			70_605,
			17_652,
			['destructive', 'spawn', 'write'],
			[
				'cli-release-hygiene',
				'perf-analysis',
				'env-validation',
				'documentation',
				'session-memory',
			],
		),
	},
} satisfies Record<string, IPresetMetadataEntry>;
