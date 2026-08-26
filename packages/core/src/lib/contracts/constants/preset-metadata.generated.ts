/**
 * preset-metadata.generated.ts — GENERATED, do not edit by hand.
 *
 * Regenerate: bun tools/scripts/generate/preset-metadata.script.ts
 * (r00024 / PRESET-001). `check:generated` fails the build if this
 * file drifts from a fresh measurement — the same measurement
 * `tools/scripts/report/token-budget-dashboard.script.ts` uses
 * (`measurePresetDashboard`, native surface).
 */
import { TOKEN_BUDGETS } from './token-budgets.constant';
import type { IPresetMetadataEntry } from '../interfaces/preset-budget-profile.interface';

export const PRESET_METADATA = {
	minimal: {
		surfaceMode: 'native',
		source: 'generated-runtime-measurement',
		measuredAt: '2026-08-26T08:29:30.307Z',
		estimator: 'heuristic-4-bytes-per-token',
		bytesPerEstimatedToken: TOKEN_BUDGETS.bytesPerEstimatedToken,
		budgetBaseline: {
			toolCount: 29,
			schemaBytes: 47800,
			coldStartTokens: 11950,
		},
	},
	lean: {
		surfaceMode: 'native',
		source: 'generated-runtime-measurement',
		measuredAt: '2026-08-26T08:29:30.307Z',
		estimator: 'heuristic-4-bytes-per-token',
		bytesPerEstimatedToken: TOKEN_BUDGETS.bytesPerEstimatedToken,
		budgetBaseline: {
			toolCount: 41,
			schemaBytes: 56160,
			coldStartTokens: 14040,
		},
	},
	standard: {
		surfaceMode: 'native',
		source: 'generated-runtime-measurement',
		measuredAt: '2026-08-26T08:29:30.307Z',
		estimator: 'heuristic-4-bytes-per-token',
		bytesPerEstimatedToken: TOKEN_BUDGETS.bytesPerEstimatedToken,
		budgetBaseline: {
			toolCount: 89,
			schemaBytes: 105610,
			coldStartTokens: 26403,
		},
	},
	swarm: {
		surfaceMode: 'native',
		source: 'generated-runtime-measurement',
		measuredAt: '2026-08-26T08:29:30.307Z',
		estimator: 'heuristic-4-bytes-per-token',
		bytesPerEstimatedToken: TOKEN_BUDGETS.bytesPerEstimatedToken,
		budgetBaseline: {
			toolCount: 155,
			schemaBytes: 166983,
			coldStartTokens: 41746,
		},
	},
	full: {
		surfaceMode: 'native',
		source: 'generated-runtime-measurement',
		measuredAt: '2026-08-26T08:29:30.307Z',
		estimator: 'heuristic-4-bytes-per-token',
		bytesPerEstimatedToken: TOKEN_BUDGETS.bytesPerEstimatedToken,
		budgetBaseline: {
			toolCount: 162,
			schemaBytes: 174318,
			coldStartTokens: 43580,
		},
	},
	vertex: {
		surfaceMode: 'native',
		source: 'generated-runtime-measurement',
		measuredAt: '2026-08-26T08:29:30.307Z',
		estimator: 'heuristic-4-bytes-per-token',
		bytesPerEstimatedToken: TOKEN_BUDGETS.bytesPerEstimatedToken,
		budgetBaseline: {
			toolCount: 182,
			schemaBytes: 248046,
			coldStartTokens: 62012,
		},
	},
	'web-app': {
		surfaceMode: 'native',
		source: 'generated-runtime-measurement',
		measuredAt: '2026-08-26T08:29:30.307Z',
		estimator: 'heuristic-4-bytes-per-token',
		bytesPerEstimatedToken: TOKEN_BUDGETS.bytesPerEstimatedToken,
		budgetBaseline: {
			toolCount: 81,
			schemaBytes: 91993,
			coldStartTokens: 22999,
		},
	},
	'backend-api': {
		surfaceMode: 'native',
		source: 'generated-runtime-measurement',
		measuredAt: '2026-08-26T08:29:30.307Z',
		estimator: 'heuristic-4-bytes-per-token',
		bytesPerEstimatedToken: TOKEN_BUDGETS.bytesPerEstimatedToken,
		budgetBaseline: {
			toolCount: 80,
			schemaBytes: 90602,
			coldStartTokens: 22651,
		},
	},
	'cli-tool': {
		surfaceMode: 'native',
		source: 'generated-runtime-measurement',
		measuredAt: '2026-08-26T08:29:30.307Z',
		estimator: 'heuristic-4-bytes-per-token',
		bytesPerEstimatedToken: TOKEN_BUDGETS.bytesPerEstimatedToken,
		budgetBaseline: {
			toolCount: 48,
			schemaBytes: 63656,
			coldStartTokens: 15914,
		},
	},
} satisfies Record<string, IPresetMetadataEntry>;
