import type { IPluginTokenBudget } from '@delendai/core/public';

/**
 * What the plugin costs a host, measured through an assembled host and a
 * listing client (`roadmap-agnosticism.spec.ts`, which holds the listing
 * under the hard cap): seven tools, 10,222 B; the largest one, 2,258 B.
 */
export const ROADMAP_TOKEN_BUDGET: IPluginTokenBudget = {
	staticBytes: 10_250,
	adaptiveActivationBytes: 2_260,
	caps: { hard: 11_500, warning: 10_800 },
	measuredAt: '2026-10-11',
	source: 'token-budget-real',
};
