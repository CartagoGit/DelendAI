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
		measuredAt: '2026-11-03T01:20:42.708Z',
		estimator: 'heuristic-4-bytes-per-token',
		bytesPerEstimatedToken: TOKEN_BUDGETS.bytesPerEstimatedToken,
		budgetBaseline: {
			toolCount: 42,
			schemaBytes: 47160,
			coldStartTokens: 11790,
		},
	},
	solo: {
		measurementSurface: 'native',
		runtimeSurface: 'managed',
		source: 'generated-runtime-measurement',
		measuredAt: '2026-11-03T01:20:42.708Z',
		estimator: 'heuristic-4-bytes-per-token',
		bytesPerEstimatedToken: TOKEN_BUDGETS.bytesPerEstimatedToken,
		budgetBaseline: {
			toolCount: 79,
			schemaBytes: 76087,
			coldStartTokens: 19022,
		},
	},
	'team-pr': {
		measurementSurface: 'native',
		runtimeSurface: 'managed',
		source: 'generated-runtime-measurement',
		measuredAt: '2026-11-03T01:20:42.708Z',
		estimator: 'heuristic-4-bytes-per-token',
		bytesPerEstimatedToken: TOKEN_BUDGETS.bytesPerEstimatedToken,
		budgetBaseline: {
			toolCount: 116,
			schemaBytes: 101723,
			coldStartTokens: 25431,
		},
	},
	swarm: {
		measurementSurface: 'native',
		runtimeSurface: 'managed',
		source: 'generated-runtime-measurement',
		measuredAt: '2026-11-03T01:20:42.708Z',
		estimator: 'heuristic-4-bytes-per-token',
		bytesPerEstimatedToken: TOKEN_BUDGETS.bytesPerEstimatedToken,
		budgetBaseline: {
			toolCount: 125,
			schemaBytes: 107148,
			coldStartTokens: 26787,
		},
	},
	audit: {
		measurementSurface: 'native',
		runtimeSurface: 'managed',
		source: 'generated-runtime-measurement',
		measuredAt: '2026-11-03T01:20:42.708Z',
		estimator: 'heuristic-4-bytes-per-token',
		bytesPerEstimatedToken: TOKEN_BUDGETS.bytesPerEstimatedToken,
		budgetBaseline: {
			toolCount: 89,
			schemaBytes: 87762,
			coldStartTokens: 21941,
		},
	},
	'docs-web': {
		measurementSurface: 'native',
		runtimeSurface: 'managed',
		source: 'generated-runtime-measurement',
		measuredAt: '2026-11-03T01:20:42.708Z',
		estimator: 'heuristic-4-bytes-per-token',
		bytesPerEstimatedToken: TOKEN_BUDGETS.bytesPerEstimatedToken,
		budgetBaseline: {
			toolCount: 61,
			schemaBytes: 62726,
			coldStartTokens: 15682,
		},
	},
	everything: {
		measurementSurface: 'native',
		runtimeSurface: 'managed',
		source: 'generated-runtime-measurement',
		measuredAt: '2026-11-03T01:20:42.708Z',
		estimator: 'heuristic-4-bytes-per-token',
		bytesPerEstimatedToken: TOKEN_BUDGETS.bytesPerEstimatedToken,
		budgetBaseline: {
			toolCount: 236,
			schemaBytes: 236429,
			coldStartTokens: 59108,
		},
	},
	dogfood: {
		measurementSurface: 'native',
		runtimeSurface: 'managed',
		source: 'generated-runtime-measurement',
		measuredAt: '2026-11-03T01:20:42.708Z',
		estimator: 'heuristic-4-bytes-per-token',
		bytesPerEstimatedToken: TOKEN_BUDGETS.bytesPerEstimatedToken,
		budgetBaseline: {
			toolCount: 237,
			schemaBytes: 263401,
			coldStartTokens: 65851,
		},
	},
} satisfies Record<string, IPresetMetadataEntry>;
