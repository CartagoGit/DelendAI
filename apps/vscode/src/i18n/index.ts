export const languages = [
	'ar',
	'de',
	'en',
	'es',
	'fr',
	'hi',
	'it',
	'ja',
	'pt',
	'th',
	'vi',
	'zh',
] as const;

export type Lang = (typeof languages)[number];

export interface IExtensionTranslations {
	readonly overviewTitle: string;
	readonly refresh: string;
	readonly runValidation: string;
	readonly openProposalBoard: string;
	readonly showMetrics: string;
	readonly toolsView: string;
	readonly proposalsView: string;
	readonly statusTooltip: string;
	// f00022 — dashboard commands and panel labels (i18n parity across 12 langs)
	readonly openDashboard: string;
	readonly openDocs: string;
	readonly tabOverview: string;
	readonly tabMetrics: string;
	readonly tabTokens: string;
	readonly tabTools: string;
	readonly tabPlugins: string;
	readonly tabSessions: string;
	readonly tabTimes: string;
	readonly tabAgents: string;
	readonly tabDocs: string;
	readonly kpiTools: string;
	readonly kpiPlugins: string;
	readonly kpiProposals: string;
	readonly kpiCalls: string;
	readonly kpiTokens: string;
	readonly kpiSaved: string;
	readonly kpiWall: string;
	readonly kpiAgents: string;
	readonly refreshDashboard: string;
	readonly docsUrlRejected: string;
	// f126 — Knowledge navigator, Health panel, Connection health
	readonly openKnowledge: string;
	readonly toolSearch: string;
	readonly restartServer: string;
	readonly tabHealth: string;
	readonly healthHealthy: string;
	readonly healthDegraded: string;
	readonly healthLocks: string;
	readonly healthStale: string;
	readonly healthQueue: string;
	readonly serverRestartHint: string;
}

export type IExtensionDictionary = Record<Lang, IExtensionTranslations>;

import { ar } from './langs/ar';
import { de } from './langs/de';
import { en } from './langs/en';
import { es } from './langs/es';
import { fr } from './langs/fr';
import { hi } from './langs/hi';
import { it } from './langs/it';
import { ja } from './langs/ja';
import { pt } from './langs/pt';
import { th } from './langs/th';
import { vi } from './langs/vi';
import { zh } from './langs/zh';

export const dictsByLang = {
	ar,
	de,
	en,
	es,
	fr,
	hi,
	it,
	ja,
	pt,
	th,
	vi,
	zh,
} as const satisfies IExtensionDictionary;
