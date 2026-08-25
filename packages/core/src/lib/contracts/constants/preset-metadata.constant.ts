import { TOKEN_BUDGETS } from './token-budgets.constant';
import type { IPresetMetadataEntry } from '../interfaces/preset-budget-profile.interface';

const PRESET_BUDGET_MEASURED_AT = '2026-08-24';

const runtimeBudgetBaseline = (
	toolCount: number,
	schemaBytes: number,
	coldStartTokens: number,
) => ({
	toolCount,
	schemaBytes,
	coldStartTokens,
});

export const PRESET_METADATA = {
	minimal: {
		role: 'orientation',
		measuredAt: PRESET_BUDGET_MEASURED_AT,
		bytesPerEstimatedToken: TOKEN_BUDGETS.bytesPerEstimatedToken,
		budgetBaseline: runtimeBudgetBaseline(29, 48_254, 12_064),
	},
	lean: {
		role: 'habitual-work',
		measuredAt: PRESET_BUDGET_MEASURED_AT,
		bytesPerEstimatedToken: TOKEN_BUDGETS.bytesPerEstimatedToken,
		budgetBaseline: runtimeBudgetBaseline(41, 60_433, 15_109),
	},
	standard: {
		role: 'adaptive-task-aware',
		measuredAt: PRESET_BUDGET_MEASURED_AT,
		bytesPerEstimatedToken: TOKEN_BUDGETS.bytesPerEstimatedToken,
		budgetBaseline: runtimeBudgetBaseline(80, 105_031, 26_258),
	},
	swarm: {
		role: 'multi-agent',
		measuredAt: PRESET_BUDGET_MEASURED_AT,
		bytesPerEstimatedToken: TOKEN_BUDGETS.bytesPerEstimatedToken,
		budgetBaseline: runtimeBudgetBaseline(143, 205_387, 51_347),
	},
	full: {
		role: 'diagnostic',
		measuredAt: PRESET_BUDGET_MEASURED_AT,
		bytesPerEstimatedToken: TOKEN_BUDGETS.bytesPerEstimatedToken,
		budgetBaseline: runtimeBudgetBaseline(150, 212_421, 53_106),
	},
	vertex: {
		role: 'mcp-vertex-dogfood',
		measuredAt: PRESET_BUDGET_MEASURED_AT,
		bytesPerEstimatedToken: TOKEN_BUDGETS.bytesPerEstimatedToken,
		budgetBaseline: runtimeBudgetBaseline(160, 270_807, 67_702),
	},
	'web-app': {
		role: 'stack-pack-web',
		measuredAt: PRESET_BUDGET_MEASURED_AT,
		bytesPerEstimatedToken: TOKEN_BUDGETS.bytesPerEstimatedToken,
		budgetBaseline: runtimeBudgetBaseline(81, 104_508, 26_127),
	},
	'backend-api': {
		role: 'stack-pack-backend',
		measuredAt: PRESET_BUDGET_MEASURED_AT,
		bytesPerEstimatedToken: TOKEN_BUDGETS.bytesPerEstimatedToken,
		budgetBaseline: runtimeBudgetBaseline(80, 102_924, 25_731),
	},
	'cli-tool': {
		role: 'stack-pack-cli',
		measuredAt: PRESET_BUDGET_MEASURED_AT,
		bytesPerEstimatedToken: TOKEN_BUDGETS.bytesPerEstimatedToken,
		budgetBaseline: runtimeBudgetBaseline(50, 70_605, 17_652),
	},
} satisfies Record<string, IPresetMetadataEntry>;
