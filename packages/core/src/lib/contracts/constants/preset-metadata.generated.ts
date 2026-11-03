/**
 * preset-metadata.generated.ts — GENERATED, do not edit by hand.
 *
 * Regenerate: bun tools/scripts/generate/preset-metadata.script.ts
 * (r00024 / PRESET-001). `check:generated` fails the build if this
 * file drifts from a fresh measurement — the same measurement
 * `tools/scripts/report/token-budget-dashboard.script.ts` uses
 * (`measurePresetDashboard`, native surface). `measurementSurface` is
 * deliberately separate from the managed runtime default: these values
 * are the comparable full-surface budget baseline. `runtimeSurface`
 * records the normal host surface and is not a runtime cache directive.
 */
import { TOKEN_BUDGETS } from './token-budgets.constant';
import type { IPresetMetadataEntry } from '../interfaces/preset-budget-profile.interface';

export const PRESET_METADATA = {
	minimal: {
		measurementSurface: 'native',
		runtimeSurface: 'managed',
		source: 'generated-runtime-measurement',
		measuredAt: '2026-11-03T04:06:37.545Z',
		estimator: 'heuristic-4-bytes-per-token',
		bytesPerEstimatedToken: TOKEN_BUDGETS.bytesPerEstimatedToken,
		budgetBaseline: {
			toolCount: 42,
			schemaBytes: 49117,
			coldStartTokens: 12280,
		},
	},
	lean: {
		measurementSurface: 'native',
		runtimeSurface: 'managed',
		source: 'generated-runtime-measurement',
		measuredAt: '2026-11-03T04:06:37.545Z',
		estimator: 'heuristic-4-bytes-per-token',
		bytesPerEstimatedToken: TOKEN_BUDGETS.bytesPerEstimatedToken,
		budgetBaseline: {
			toolCount: 55,
			schemaBytes: 57489,
			coldStartTokens: 14373,
		},
	},
	standard: {
		measurementSurface: 'native',
		runtimeSurface: 'managed',
		source: 'generated-runtime-measurement',
		measuredAt: '2026-11-03T04:06:37.545Z',
		estimator: 'heuristic-4-bytes-per-token',
		bytesPerEstimatedToken: TOKEN_BUDGETS.bytesPerEstimatedToken,
		budgetBaseline: {
			toolCount: 113,
			schemaBytes: 106823,
			coldStartTokens: 26706,
		},
	},
	swarm: {
		measurementSurface: 'native',
		runtimeSurface: 'managed',
		source: 'generated-runtime-measurement',
		measuredAt: '2026-11-03T04:06:37.545Z',
		estimator: 'heuristic-4-bytes-per-token',
		bytesPerEstimatedToken: TOKEN_BUDGETS.bytesPerEstimatedToken,
		budgetBaseline: {
			toolCount: 154,
			schemaBytes: 129890,
			coldStartTokens: 32473,
		},
	},
	full: {
		measurementSurface: 'native',
		runtimeSurface: 'managed',
		source: 'generated-runtime-measurement',
		measuredAt: '2026-11-03T04:06:37.545Z',
		estimator: 'heuristic-4-bytes-per-token',
		bytesPerEstimatedToken: TOKEN_BUDGETS.bytesPerEstimatedToken,
		budgetBaseline: {
			toolCount: 185,
			schemaBytes: 154639,
			coldStartTokens: 38660,
		},
	},
	dogfood: {
		measurementSurface: 'native',
		runtimeSurface: 'managed',
		source: 'generated-runtime-measurement',
		measuredAt: '2026-11-03T04:06:37.545Z',
		estimator: 'heuristic-4-bytes-per-token',
		bytesPerEstimatedToken: TOKEN_BUDGETS.bytesPerEstimatedToken,
		budgetBaseline: {
			toolCount: 237,
			schemaBytes: 265358,
			coldStartTokens: 66340,
		},
	},
	'web-app': {
		measurementSurface: 'native',
		runtimeSurface: 'managed',
		source: 'generated-runtime-measurement',
		measuredAt: '2026-11-03T04:06:37.545Z',
		estimator: 'heuristic-4-bytes-per-token',
		bytesPerEstimatedToken: TOKEN_BUDGETS.bytesPerEstimatedToken,
		budgetBaseline: {
			toolCount: 103,
			schemaBytes: 92615,
			coldStartTokens: 23154,
		},
	},
	'backend-api': {
		measurementSurface: 'native',
		runtimeSurface: 'managed',
		source: 'generated-runtime-measurement',
		measuredAt: '2026-11-03T04:06:37.545Z',
		estimator: 'heuristic-4-bytes-per-token',
		bytesPerEstimatedToken: TOKEN_BUDGETS.bytesPerEstimatedToken,
		budgetBaseline: {
			toolCount: 102,
			schemaBytes: 91216,
			coldStartTokens: 22804,
		},
	},
	'cli-tool': {
		measurementSurface: 'native',
		runtimeSurface: 'managed',
		source: 'generated-runtime-measurement',
		measuredAt: '2026-11-03T04:06:37.545Z',
		estimator: 'heuristic-4-bytes-per-token',
		bytesPerEstimatedToken: TOKEN_BUDGETS.bytesPerEstimatedToken,
		budgetBaseline: {
			toolCount: 62,
			schemaBytes: 64710,
			coldStartTokens: 16178,
		},
	},
} satisfies Record<string, IPresetMetadataEntry>;
