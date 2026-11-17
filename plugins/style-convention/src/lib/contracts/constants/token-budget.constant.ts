import type { IPluginTokenBudget } from '@delendai/core/public';

/**
 * What the plugin costs a host: three read-only tools, measured through
 * an assembled host and a listing client by
 * `style-convention-over-mcp.spec.ts`, which holds the listing under the
 * hard cap: 3,493 B in all; the largest tool, 1,427 B.
 */
export const STYLE_CONVENTION_TOKEN_BUDGET: IPluginTokenBudget = {
	staticBytes: 3_500,
	adaptiveActivationBytes: 1_430,
	caps: { hard: 4_200, warning: 3_900 },
	measuredAt: '2026-10-11',
	source: 'token-budget-real',
};
