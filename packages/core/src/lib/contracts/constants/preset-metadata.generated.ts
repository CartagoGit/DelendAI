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
		measuredAt: '2026-08-26T13:10:27.974Z',
		estimator: 'heuristic-4-bytes-per-token',
		bytesPerEstimatedToken: TOKEN_BUDGETS.bytesPerEstimatedToken,
		budgetBaseline: {
			toolCount: 33,
			schemaBytes: 51297,
			coldStartTokens: 12825,
		},
	},
	lean: {
		surfaceMode: 'native',
		source: 'generated-runtime-measurement',
		measuredAt: '2026-08-26T13:10:27.974Z',
		estimator: 'heuristic-4-bytes-per-token',
		bytesPerEstimatedToken: TOKEN_BUDGETS.bytesPerEstimatedToken,
		budgetBaseline: {
			toolCount: 45,
			schemaBytes: 59657,
			coldStartTokens: 14915,
		},
	},
	standard: {
		surfaceMode: 'native',
		source: 'generated-runtime-measurement',
		measuredAt: '2026-08-26T13:10:27.974Z',
		estimator: 'heuristic-4-bytes-per-token',
		bytesPerEstimatedToken: TOKEN_BUDGETS.bytesPerEstimatedToken,
		budgetBaseline: {
			toolCount: 93,
			schemaBytes: 109107,
			coldStartTokens: 27277,
		},
	},
	swarm: {
		surfaceMode: 'native',
		source: 'generated-runtime-measurement',
		measuredAt: '2026-08-26T13:10:27.974Z',
		estimator: 'heuristic-4-bytes-per-token',
		bytesPerEstimatedToken: TOKEN_BUDGETS.bytesPerEstimatedToken,
		budgetBaseline: {
			toolCount: 159,
			schemaBytes: 170480,
			coldStartTokens: 42620,
		},
	},
	full: {
		surfaceMode: 'native',
		source: 'generated-runtime-measurement',
		measuredAt: '2026-08-26T13:10:27.974Z',
		estimator: 'heuristic-4-bytes-per-token',
		bytesPerEstimatedToken: TOKEN_BUDGETS.bytesPerEstimatedToken,
		budgetBaseline: {
			toolCount: 166,
			schemaBytes: 177815,
			coldStartTokens: 44454,
		},
	},
	vertex: {
		surfaceMode: 'native',
		source: 'generated-runtime-measurement',
		measuredAt: '2026-08-26T13:10:27.974Z',
		estimator: 'heuristic-4-bytes-per-token',
		bytesPerEstimatedToken: TOKEN_BUDGETS.bytesPerEstimatedToken,
		budgetBaseline: {
			toolCount: 186,
			schemaBytes: 251543,
			coldStartTokens: 62886,
		},
	},
	'web-app': {
		surfaceMode: 'native',
		source: 'generated-runtime-measurement',
		measuredAt: '2026-08-26T13:10:27.974Z',
		estimator: 'heuristic-4-bytes-per-token',
		bytesPerEstimatedToken: TOKEN_BUDGETS.bytesPerEstimatedToken,
		budgetBaseline: {
			toolCount: 85,
			schemaBytes: 95490,
			coldStartTokens: 23873,
		},
	},
	'backend-api': {
		surfaceMode: 'native',
		source: 'generated-runtime-measurement',
		measuredAt: '2026-08-26T13:10:27.974Z',
		estimator: 'heuristic-4-bytes-per-token',
		bytesPerEstimatedToken: TOKEN_BUDGETS.bytesPerEstimatedToken,
		budgetBaseline: {
			toolCount: 84,
			schemaBytes: 94099,
			coldStartTokens: 23525,
		},
	},
	'cli-tool': {
		surfaceMode: 'native',
		source: 'generated-runtime-measurement',
		measuredAt: '2026-08-26T13:10:27.974Z',
		estimator: 'heuristic-4-bytes-per-token',
		bytesPerEstimatedToken: TOKEN_BUDGETS.bytesPerEstimatedToken,
		budgetBaseline: {
			toolCount: 52,
			schemaBytes: 67153,
			coldStartTokens: 16789,
		},
	},
} satisfies Record<string, IPresetMetadataEntry>;
