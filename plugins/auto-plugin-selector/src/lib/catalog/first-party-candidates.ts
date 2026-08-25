/**
 * first-party-candidates.ts — x00169: `plugins_recommend`'s default
 * catalog. The tool's own docstring promised "the bundled
 * FIRST_PARTY_PLUGIN_INDEX" as the default, but no wiring ever
 * imported it — `plugins_recommend` scored against `options.candidates
 * ?? []`, so every call returned an empty `recommendations` array
 * regardless of the input signals. `FIRST_PARTY_PLUGIN_INDEX` already
 * exists (core's plugin registry, `@mcp-vertex/core/public`) as the
 * single source of truth for every first-party plugin's id/tags/
 * summary — this just maps its entries into the scorer's
 * `IPluginCandidate` shape instead of duplicating the list.
 */
import { FIRST_PARTY_PLUGIN_INDEX } from '@mcp-vertex/core/public';

import type { IPluginCandidate } from '../contracts/interfaces/plugin-fit.interface';

export const firstPartyPluginCandidates = (): readonly IPluginCandidate[] =>
	FIRST_PARTY_PLUGIN_INDEX.entries.map((entry) => ({
		id: entry.id,
		tags: entry.tags,
		summary: entry.summary,
		...(entry.permissions === undefined
			? {}
			: { permissions: entry.permissions }),
		origin: entry.origin,
		// r00025 S1: forward `tokenBudgetBytes` from the registry so the
		// token-tax signal has data to work with. We map it to the
		// legacy `number` form (`scoreTokenTax` understands all three).
		...(entry.tokenBudgetBytes === undefined
			? {}
			: { tokenBudget: entry.tokenBudgetBytes }),
	}));
