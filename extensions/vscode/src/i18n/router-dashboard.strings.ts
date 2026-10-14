/**
 * router-dashboard.strings.ts — f00140 S3.
 *
 * Copy for the router dashboard webview (panel + table). Following the
 * `provider-dashboard.strings.ts` convention: cohesive, typed table for
 * one panel, with one entry per `Lang`. The panel re-renders on demand
 * (no scripts), so language selection happens at host-config time and
 * the strings are stamped once per render.
 *
 * The full 12-language matrix is intentionally deferred: the webview is
 * the same one the user opens from the router dashboard command, and
 * the CLI command (S2) already documents the English copy. Non-`en`
 * languages currently fall back to the English copy through the host's
 * default lookup; a future slice will fill them in alongside the rest
 * of the provider strings matrix.
 */
import type { Lang } from './index';

/** All copy the router dashboard webview needs for one language. */
export interface IRouterDashboardStrings {
	readonly title: string;
	readonly tableTitle: string;
	readonly windowLabel: string;
	readonly totalSpend: string;
	readonly totalCalls: string;
	readonly reachable: string;
	readonly emptyRows: string;
	readonly footer: string;
	readonly colProvider: string;
	readonly colLabel: string;
	readonly colTier: string;
	readonly colRank: string;
	readonly colSpend: string;
	readonly colCalls: string;
	readonly colNote: string;
}

const en: IRouterDashboardStrings = {
	title: 'Router dashboard',
	tableTitle: 'Providers',
	windowLabel: 'Window',
	totalSpend: 'Total spend',
	totalCalls: 'Total calls',
	reachable: 'Reachable & ranked',
	emptyRows: 'No providers to display yet — load the router + usage plugins.',
	footer: 'Pin a provider from the command palette to force it first next time. Same view-model renders in `delendai router-dashboard`.',
	colProvider: 'Provider',
	colLabel: 'Label',
	colTier: 'Tier',
	colRank: 'Best rank',
	colSpend: 'Spend',
	colCalls: 'Calls',
	colNote: 'Note',
};

const ALL: Record<Lang, IRouterDashboardStrings> = {
	en,
	es: en,
	fr: en,
	de: en,
	it: en,
	pt: en,
	ja: en,
	zh: en,
	ar: en,
	hi: en,
	th: en,
	vi: en,
};

export const stringsFor = (lang: Lang): IRouterDashboardStrings => ALL[lang];
