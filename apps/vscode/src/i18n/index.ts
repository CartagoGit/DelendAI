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
