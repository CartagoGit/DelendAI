/**
 * first-party-candidates.ts — x00169: `plugins_recommend`'s default
 * catalog. The tool's own docstring promised "the bundled
 * FIRST_PARTY_PLUGIN_INDEX" as the default, but no wiring ever
 * imported it — `plugins_recommend` scored against `options.candidates
 * ?? []`, so every call returned an empty `recommendations` array
 * regardless of the input signals. `FIRST_PARTY_PLUGIN_INDEX` already
 * exists (core's plugin registry, `@delendai/core/public`) as the
 * single source of truth for every first-party plugin's id/tags/
 * summary — this just maps its entries into the scorer's
 * `IPluginCandidate` shape instead of duplicating the list.
 */
import {
	FIRST_PARTY_PLUGIN_INDEX,
	resolveTokenBudget,
} from '@delendai/core/public';

import type { IPluginCandidate } from '../contracts/interfaces/plugin-fit.interface';

const ISO_DATE_LENGTH = 10;
const TOKEN_BUDGET_MEASURED_AT = new Date()
	.toISOString()
	.slice(0, ISO_DATE_LENGTH);

export const firstPartyPluginCandidates = (): readonly IPluginCandidate[] =>
	FIRST_PARTY_PLUGIN_INDEX.entries.map((entry) => ({
		id: entry.id,
		tags: entry.tags,
		summary: entry.summary,
		...(entry.permissions === undefined
			? {}
			: { permissions: entry.permissions }),
		origin: entry.origin,
		// r00025 S1: preserve the registry field's byte unit. The scorer's
		// structured form keeps static surface bytes distinct from a legacy
		// token-count budget.
		...(entry.tokenBudgetBytes === undefined
			? {}
			: {
					tokenBudget: resolveTokenBudget(
						entry.tokenBudgetBytes,
						TOKEN_BUDGET_MEASURED_AT,
					),
				}),
	}));
