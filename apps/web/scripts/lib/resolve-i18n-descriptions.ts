/**
 * `resolveI18nDescriptions` — flatten the per-tool i18n catalogue into a
 * precomputed map the docs site can ship with `capabilities.json` so SSR
 * renders the active language without runtime lookups. See p100 s4-bis /
 * p110 s1.
 *
 * The catalogue at `apps/web/src/i18n/tools/index.ts` is a runtime registry
 * keyed by `<namespace>_<tool>` (e.g. `mcp-vertex_overview`). Each entry
 * carries `description: Record<Lang, string>`. We resolve that record into
 * the exact shape we want to dump — `{ [lang]: description }` — so the
 * site never has to call `describeTool()` for the active language at
 * render time.
 *
 * Why a separate module: the i18n catalogue lives in `src/`, the JSON
 * pipeline lives in `scripts/`. Importing the catalogue directly into
 * `gen-capabilities.ts` is fine (both run under Bun during build), but
 * keeping the resolver behind a pure function lets us test it without
 * spinning up an Astro/Vite environment.
 *
 * SRP: this file is pure. The catalogue itself is stateful (a Map
 * populated at import time); we hide that behind a function so tests
 * can substitute a frozen dict via `setToolI18n()` if they ever need to.
 */

import type { Lang } from '../../src/i18n/shared';
import { listRegisteredTools } from '../../src/i18n/tools';

/** Map of tool name → 12-language description block. */
export type IResolvedDescriptions = Readonly<
	Record<string, Readonly<Record<Lang, string>>>
>;

/**
 * Resolve every registered tool entry into a 12-lang description block.
 *
 * Returned shape:
 *
 *   {
 *     "mcp-vertex_overview": { en: "...", es: "...", ... },
 *     "proposals_auto_work": { en: "...", es: "...", ... },
 *     ...
 *   }
 *
 * Tools NOT in the catalogue are absent from the result — callers fall
 * back to the runtime `description` (always English) for those.
 */
export const resolveI18nDescriptions = (): IResolvedDescriptions => {
	const out: Record<string, Record<Lang, string>> = {};
	for (const { name, dict } of listRegisteredTools()) {
		// `description` is typed as `Readonly<Record<Lang, string>>` already,
		// but we clone so the result is fully serialisable (no leaked refs).
		const block: Record<Lang, string> = { ...dict.description };
		out[name] = block;
	}
	return out;
};
