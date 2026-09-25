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
		measuredAt: '2026-09-25T07:16:00.703Z',
		estimator: 'heuristic-4-bytes-per-token',
		bytesPerEstimatedToken: TOKEN_BUDGETS.bytesPerEstimatedToken,
		budgetBaseline: {
			toolCount: 41,
			schemaBytes: 44794,
			coldStartTokens: 11199,
		},
	},
	lean: {
		measurementSurface: 'native',
		runtimeSurface: 'managed',
		source: 'generated-runtime-measurement',
		measuredAt: '2026-09-25T07:16:00.703Z',
		estimator: 'heuristic-4-bytes-per-token',
		bytesPerEstimatedToken: TOKEN_BUDGETS.bytesPerEstimatedToken,
		budgetBaseline: {
			toolCount: 54,
			schemaBytes: 52972,
			coldStartTokens: 13243,
		},
	},
	standard: {
		measurementSurface: 'native',
		runtimeSurface: 'managed',
		source: 'generated-runtime-measurement',
		measuredAt: '2026-09-25T07:16:00.703Z',
		estimator: 'heuristic-4-bytes-per-token',
		bytesPerEstimatedToken: TOKEN_BUDGETS.bytesPerEstimatedToken,
		budgetBaseline: {
			toolCount: 106,
			schemaBytes: 98014,
			coldStartTokens: 24504,
		},
	},
	swarm: {
		measurementSurface: 'native',
		runtimeSurface: 'managed',
		source: 'generated-runtime-measurement',
		measuredAt: '2026-09-25T07:16:00.703Z',
		estimator: 'heuristic-4-bytes-per-token',
		bytesPerEstimatedToken: TOKEN_BUDGETS.bytesPerEstimatedToken,
		budgetBaseline: {
			toolCount: 151,
			schemaBytes: 130160,
			coldStartTokens: 32540,
		},
	},
	full: {
		measurementSurface: 'native',
		runtimeSurface: 'managed',
		source: 'generated-runtime-measurement',
		measuredAt: '2026-09-25T07:16:00.703Z',
		estimator: 'heuristic-4-bytes-per-token',
		bytesPerEstimatedToken: TOKEN_BUDGETS.bytesPerEstimatedToken,
		budgetBaseline: {
			toolCount: 181,
			schemaBytes: 152518,
			coldStartTokens: 38130,
		},
	},
	dogfood: {
		measurementSurface: 'native',
		runtimeSurface: 'managed',
		source: 'generated-runtime-measurement',
		measuredAt: '2026-09-25T07:16:00.703Z',
		estimator: 'heuristic-4-bytes-per-token',
		bytesPerEstimatedToken: TOKEN_BUDGETS.bytesPerEstimatedToken,
		budgetBaseline: {
			toolCount: 224,
			schemaBytes: 220404,
			coldStartTokens: 55101,
		},
	},
	'web-app': {
		measurementSurface: 'native',
		runtimeSurface: 'managed',
		source: 'generated-runtime-measurement',
		measuredAt: '2026-09-25T07:16:00.703Z',
		estimator: 'heuristic-4-bytes-per-token',
		bytesPerEstimatedToken: TOKEN_BUDGETS.bytesPerEstimatedToken,
		budgetBaseline: {
			toolCount: 96,
			schemaBytes: 84212,
			coldStartTokens: 21053,
		},
	},
	'backend-api': {
		measurementSurface: 'native',
		runtimeSurface: 'managed',
		source: 'generated-runtime-measurement',
		measuredAt: '2026-09-25T07:16:00.703Z',
		estimator: 'heuristic-4-bytes-per-token',
		bytesPerEstimatedToken: TOKEN_BUDGETS.bytesPerEstimatedToken,
		budgetBaseline: {
			toolCount: 95,
			schemaBytes: 82850,
			coldStartTokens: 20713,
		},
	},
	'cli-tool': {
		measurementSurface: 'native',
		runtimeSurface: 'managed',
		source: 'generated-runtime-measurement',
		measuredAt: '2026-09-25T07:16:00.703Z',
		estimator: 'heuristic-4-bytes-per-token',
		bytesPerEstimatedToken: TOKEN_BUDGETS.bytesPerEstimatedToken,
		budgetBaseline: {
			toolCount: 61,
			schemaBytes: 60116,
			coldStartTokens: 15029,
		},
	},
} satisfies Record<string, IPresetMetadataEntry>;
