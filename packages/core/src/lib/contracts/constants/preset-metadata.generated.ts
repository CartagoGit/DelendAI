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
		measuredAt: '2026-08-26T01:28:31.914Z',
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
		measuredAt: '2026-08-26T01:28:31.914Z',
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
		measuredAt: '2026-08-26T01:28:31.914Z',
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
		measuredAt: '2026-08-26T01:28:31.914Z',
		estimator: 'heuristic-4-bytes-per-token',
		bytesPerEstimatedToken: TOKEN_BUDGETS.bytesPerEstimatedToken,
		budgetBaseline: {
			toolCount: 150,
			schemaBytes: 159716,
			coldStartTokens: 39929,
		},
	},
	full: {
		surfaceMode: 'native',
		source: 'generated-runtime-measurement',
		measuredAt: '2026-08-26T01:28:31.914Z',
		estimator: 'heuristic-4-bytes-per-token',
		bytesPerEstimatedToken: TOKEN_BUDGETS.bytesPerEstimatedToken,
		budgetBaseline: {
			toolCount: 157,
			schemaBytes: 167051,
			coldStartTokens: 41763,
		},
	},
	vertex: {
		surfaceMode: 'native',
		source: 'generated-runtime-measurement',
		measuredAt: '2026-08-26T01:28:31.914Z',
		estimator: 'heuristic-4-bytes-per-token',
		bytesPerEstimatedToken: TOKEN_BUDGETS.bytesPerEstimatedToken,
		budgetBaseline: {
			toolCount: 177,
			schemaBytes: 241543,
			coldStartTokens: 60386,
		},
	},
	'web-app': {
		surfaceMode: 'native',
		source: 'generated-runtime-measurement',
		measuredAt: '2026-08-26T01:28:31.914Z',
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
		measuredAt: '2026-08-26T01:28:31.914Z',
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
		measuredAt: '2026-08-26T01:28:31.914Z',
		estimator: 'heuristic-4-bytes-per-token',
		bytesPerEstimatedToken: TOKEN_BUDGETS.bytesPerEstimatedToken,
		budgetBaseline: {
			toolCount: 48,
			schemaBytes: 63656,
			coldStartTokens: 15914,
		},
	},
} satisfies Record<string, IPresetMetadataEntry>;
