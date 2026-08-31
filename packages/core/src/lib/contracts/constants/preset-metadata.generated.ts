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
		measuredAt: '2026-08-31T04:16:59.396Z',
		estimator: 'heuristic-4-bytes-per-token',
		bytesPerEstimatedToken: TOKEN_BUDGETS.bytesPerEstimatedToken,
		budgetBaseline: {
			toolCount: 37,
			schemaBytes: 41876,
			coldStartTokens: 10469,
		},
	},
	lean: {
		measurementSurface: 'native',
		runtimeSurface: 'managed',
		source: 'generated-runtime-measurement',
		measuredAt: '2026-08-31T04:16:59.396Z',
		estimator: 'heuristic-4-bytes-per-token',
		bytesPerEstimatedToken: TOKEN_BUDGETS.bytesPerEstimatedToken,
		budgetBaseline: {
			toolCount: 49,
			schemaBytes: 50236,
			coldStartTokens: 12559,
		},
	},
	standard: {
		measurementSurface: 'native',
		runtimeSurface: 'managed',
		source: 'generated-runtime-measurement',
		measuredAt: '2026-08-31T04:16:59.396Z',
		estimator: 'heuristic-4-bytes-per-token',
		bytesPerEstimatedToken: TOKEN_BUDGETS.bytesPerEstimatedToken,
		budgetBaseline: {
			toolCount: 99,
			schemaBytes: 99627,
			coldStartTokens: 24907,
		},
	},
	swarm: {
		measurementSurface: 'native',
		runtimeSurface: 'managed',
		source: 'generated-runtime-measurement',
		measuredAt: '2026-08-31T04:16:59.396Z',
		estimator: 'heuristic-4-bytes-per-token',
		bytesPerEstimatedToken: TOKEN_BUDGETS.bytesPerEstimatedToken,
		budgetBaseline: {
			toolCount: 165,
			schemaBytes: 158995,
			coldStartTokens: 39749,
		},
	},
	full: {
		measurementSurface: 'native',
		runtimeSurface: 'managed',
		source: 'generated-runtime-measurement',
		measuredAt: '2026-08-31T04:16:59.396Z',
		estimator: 'heuristic-4-bytes-per-token',
		bytesPerEstimatedToken: TOKEN_BUDGETS.bytesPerEstimatedToken,
		budgetBaseline: {
			toolCount: 172,
			schemaBytes: 166330,
			coldStartTokens: 41583,
		},
	},
	vertex: {
		measurementSurface: 'native',
		runtimeSurface: 'managed',
		source: 'generated-runtime-measurement',
		measuredAt: '2026-08-31T04:16:59.396Z',
		estimator: 'heuristic-4-bytes-per-token',
		bytesPerEstimatedToken: TOKEN_BUDGETS.bytesPerEstimatedToken,
		budgetBaseline: {
			toolCount: 196,
			schemaBytes: 228130,
			coldStartTokens: 57033,
		},
	},
	'web-app': {
		measurementSurface: 'native',
		runtimeSurface: 'managed',
		source: 'generated-runtime-measurement',
		measuredAt: '2026-08-31T04:16:59.396Z',
		estimator: 'heuristic-4-bytes-per-token',
		bytesPerEstimatedToken: TOKEN_BUDGETS.bytesPerEstimatedToken,
		budgetBaseline: {
			toolCount: 89,
			schemaBytes: 86694,
			coldStartTokens: 21674,
		},
	},
	'backend-api': {
		measurementSurface: 'native',
		runtimeSurface: 'managed',
		source: 'generated-runtime-measurement',
		measuredAt: '2026-08-31T04:16:59.396Z',
		estimator: 'heuristic-4-bytes-per-token',
		bytesPerEstimatedToken: TOKEN_BUDGETS.bytesPerEstimatedToken,
		budgetBaseline: {
			toolCount: 88,
			schemaBytes: 85303,
			coldStartTokens: 21326,
		},
	},
	'cli-tool': {
		measurementSurface: 'native',
		runtimeSurface: 'managed',
		source: 'generated-runtime-measurement',
		measuredAt: '2026-08-31T04:16:59.396Z',
		estimator: 'heuristic-4-bytes-per-token',
		bytesPerEstimatedToken: TOKEN_BUDGETS.bytesPerEstimatedToken,
		budgetBaseline: {
			toolCount: 56,
			schemaBytes: 58110,
			coldStartTokens: 14528,
		},
	},
} satisfies Record<string, IPresetMetadataEntry>;
