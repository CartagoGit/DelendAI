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
		measuredAt: '2026-08-26T07:47:52.259Z',
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
		measuredAt: '2026-08-26T07:47:52.259Z',
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
		measuredAt: '2026-08-26T07:47:52.259Z',
		estimator: 'heuristic-4-bytes-per-token',
		bytesPerEstimatedToken: TOKEN_BUDGETS.bytesPerEstimatedToken,
		budgetBaseline: {
			toolCount: 85,
			schemaBytes: 98784,
			coldStartTokens: 24696,
		},
	},
	swarm: {
		surfaceMode: 'native',
		source: 'generated-runtime-measurement',
		measuredAt: '2026-08-26T07:47:52.259Z',
		estimator: 'heuristic-4-bytes-per-token',
		bytesPerEstimatedToken: TOKEN_BUDGETS.bytesPerEstimatedToken,
		budgetBaseline: {
			toolCount: 151,
			schemaBytes: 160157,
			coldStartTokens: 40040,
		},
	},
	full: {
		surfaceMode: 'native',
		source: 'generated-runtime-measurement',
		measuredAt: '2026-08-26T07:47:52.259Z',
		estimator: 'heuristic-4-bytes-per-token',
		bytesPerEstimatedToken: TOKEN_BUDGETS.bytesPerEstimatedToken,
		budgetBaseline: {
			toolCount: 158,
			schemaBytes: 167492,
			coldStartTokens: 41873,
		},
	},
	vertex: {
		surfaceMode: 'native',
		source: 'generated-runtime-measurement',
		measuredAt: '2026-08-26T07:47:52.259Z',
		estimator: 'heuristic-4-bytes-per-token',
		bytesPerEstimatedToken: TOKEN_BUDGETS.bytesPerEstimatedToken,
		budgetBaseline: {
			toolCount: 178,
			schemaBytes: 241220,
			coldStartTokens: 60305,
		},
	},
	'web-app': {
		surfaceMode: 'native',
		source: 'generated-runtime-measurement',
		measuredAt: '2026-08-26T07:47:52.259Z',
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
		measuredAt: '2026-08-26T07:47:52.259Z',
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
		measuredAt: '2026-08-26T07:47:52.259Z',
		estimator: 'heuristic-4-bytes-per-token',
		bytesPerEstimatedToken: TOKEN_BUDGETS.bytesPerEstimatedToken,
		budgetBaseline: {
			toolCount: 48,
			schemaBytes: 63656,
			coldStartTokens: 15914,
		},
	},
} satisfies Record<string, IPresetMetadataEntry>;
