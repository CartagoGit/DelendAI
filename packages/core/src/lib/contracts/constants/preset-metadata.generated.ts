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
		measuredAt: '2026-10-03T23:45:28.509Z',
		estimator: 'heuristic-4-bytes-per-token',
		bytesPerEstimatedToken: TOKEN_BUDGETS.bytesPerEstimatedToken,
		budgetBaseline: {
			toolCount: 42,
			schemaBytes: 45701,
			coldStartTokens: 11426,
		},
	},
	lean: {
		measurementSurface: 'native',
		runtimeSurface: 'managed',
		source: 'generated-runtime-measurement',
		measuredAt: '2026-10-03T23:45:28.509Z',
		estimator: 'heuristic-4-bytes-per-token',
		bytesPerEstimatedToken: TOKEN_BUDGETS.bytesPerEstimatedToken,
		budgetBaseline: {
			toolCount: 55,
			schemaBytes: 53879,
			coldStartTokens: 13470,
		},
	},
	standard: {
		measurementSurface: 'native',
		runtimeSurface: 'managed',
		source: 'generated-runtime-measurement',
		measuredAt: '2026-10-03T23:45:28.509Z',
		estimator: 'heuristic-4-bytes-per-token',
		bytesPerEstimatedToken: TOKEN_BUDGETS.bytesPerEstimatedToken,
		budgetBaseline: {
			toolCount: 107,
			schemaBytes: 98921,
			coldStartTokens: 24731,
		},
	},
	swarm: {
		measurementSurface: 'native',
		runtimeSurface: 'managed',
		source: 'generated-runtime-measurement',
		measuredAt: '2026-10-03T23:45:28.509Z',
		estimator: 'heuristic-4-bytes-per-token',
		bytesPerEstimatedToken: TOKEN_BUDGETS.bytesPerEstimatedToken,
		budgetBaseline: {
			toolCount: 152,
			schemaBytes: 132026,
			coldStartTokens: 33007,
		},
	},
	full: {
		measurementSurface: 'native',
		runtimeSurface: 'managed',
		source: 'generated-runtime-measurement',
		measuredAt: '2026-10-03T23:45:28.509Z',
		estimator: 'heuristic-4-bytes-per-token',
		bytesPerEstimatedToken: TOKEN_BUDGETS.bytesPerEstimatedToken,
		budgetBaseline: {
			toolCount: 182,
			schemaBytes: 154384,
			coldStartTokens: 38596,
		},
	},
	dogfood: {
		measurementSurface: 'native',
		runtimeSurface: 'managed',
		source: 'generated-runtime-measurement',
		measuredAt: '2026-10-03T23:45:28.509Z',
		estimator: 'heuristic-4-bytes-per-token',
		bytesPerEstimatedToken: TOKEN_BUDGETS.bytesPerEstimatedToken,
		budgetBaseline: {
			toolCount: 227,
			schemaBytes: 227165,
			coldStartTokens: 56792,
		},
	},
	'web-app': {
		measurementSurface: 'native',
		runtimeSurface: 'managed',
		source: 'generated-runtime-measurement',
		measuredAt: '2026-10-03T23:45:28.509Z',
		estimator: 'heuristic-4-bytes-per-token',
		bytesPerEstimatedToken: TOKEN_BUDGETS.bytesPerEstimatedToken,
		budgetBaseline: {
			toolCount: 97,
			schemaBytes: 85119,
			coldStartTokens: 21280,
		},
	},
	'backend-api': {
		measurementSurface: 'native',
		runtimeSurface: 'managed',
		source: 'generated-runtime-measurement',
		measuredAt: '2026-10-03T23:45:28.509Z',
		estimator: 'heuristic-4-bytes-per-token',
		bytesPerEstimatedToken: TOKEN_BUDGETS.bytesPerEstimatedToken,
		budgetBaseline: {
			toolCount: 96,
			schemaBytes: 83757,
			coldStartTokens: 20940,
		},
	},
	'cli-tool': {
		measurementSurface: 'native',
		runtimeSurface: 'managed',
		source: 'generated-runtime-measurement',
		measuredAt: '2026-10-03T23:45:28.509Z',
		estimator: 'heuristic-4-bytes-per-token',
		bytesPerEstimatedToken: TOKEN_BUDGETS.bytesPerEstimatedToken,
		budgetBaseline: {
			toolCount: 62,
			schemaBytes: 61023,
			coldStartTokens: 15256,
		},
	},
} satisfies Record<string, IPresetMetadataEntry>;
