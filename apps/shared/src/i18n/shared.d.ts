import { type HostLanguage } from '@mcp-vertex/client/lib/contracts/interfaces/settings.interface';
import type { ISettingsTranslations } from '../contracts/interfaces/settings-translations.interface';
export declare const languageCodes: readonly [
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
];
export type Lang = HostLanguage;
export interface ILangMeta {
	readonly code: Lang;
	readonly label: string;
	/** ISO 3166 country code used to resolve the flag SVG. */
	readonly flag: string;
}
export declare const languages: readonly [
	{
		readonly code: 'ar';
		readonly label: 'العربية';
		readonly flag: 'sa';
	},
	{
		readonly code: 'de';
		readonly label: 'Deutsch';
		readonly flag: 'de';
	},
	{
		readonly code: 'en';
		readonly label: 'English';
		readonly flag: 'gb';
	},
	{
		readonly code: 'es';
		readonly label: 'Español';
		readonly flag: 'es';
	},
	{
		readonly code: 'fr';
		readonly label: 'Français';
		readonly flag: 'fr';
	},
	{
		readonly code: 'hi';
		readonly label: 'हिन्दी';
		readonly flag: 'in';
	},
	{
		readonly code: 'it';
		readonly label: 'Italiano';
		readonly flag: 'it';
	},
	{
		readonly code: 'ja';
		readonly label: '日本語';
		readonly flag: 'jp';
	},
	{
		readonly code: 'pt';
		readonly label: 'Português';
		readonly flag: 'pt';
	},
	{
		readonly code: 'th';
		readonly label: 'ไทย';
		readonly flag: 'th';
	},
	{
		readonly code: 'vi';
		readonly label: 'Tiếng Việt';
		readonly flag: 'vn';
	},
	{
		readonly code: 'zh';
		readonly label: '中文';
		readonly flag: 'cn';
	},
];
export declare const rtlLangs: readonly Lang[];
export declare const defaultLang: Lang;
export declare const themes: readonly [
	'dark',
	'light',
	'midnight',
	'solarized',
	'nord',
];
export type Theme = (typeof themes)[number];
export declare const flagFor: (lang: Lang) => string;
/** Nested site translations — the existing `apps/web/src/i18n/shared.ts#ITranslations` shape, lifted verbatim. */
export interface ISiteTranslations {
	readonly nav: {
		readonly concept: string;
		readonly install: string;
		readonly tools: string;
		readonly benchmarks: string;
		readonly plugins: string;
		readonly presets: string;
		readonly github: string;
		readonly menu: string;
		readonly knowledge: string;
		readonly prompts: string;
		readonly resources: string;
		readonly skills: string;
		readonly guide: string;
		readonly more: string;
		readonly firstFiveMinutes: string;
		readonly troubleshooting: string;
	};
	readonly [section: string]: unknown;
}
/** Flat extension translations — the existing `extensions/vscode/src/i18n/index.ts#IExtensionTranslations` shape, lifted verbatim. */
export interface IExtensionTranslations {
	/** x00103: aria-label for the shared toast's close button. */
	readonly a11yCloseToast: string;
	/** x00103: aria-label for the shared language picker's select. */
	readonly a11yLanguageSelector: string;
	readonly overviewTitle: string;
	readonly refresh: string;
	readonly runValidation: string;
	readonly openProposalBoard: string;
	readonly showMetrics: string;
	readonly toolsView: string;
	readonly proposalsView: string;
	readonly statusTooltip: string;
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
	readonly openKnowledge: string;
	readonly toolSearch: string;
	readonly restartServer: string;
	readonly openSettings: string;
	readonly memorySave: string;
	readonly memoryForget: string;
	readonly tabHealth: string;
	readonly healthHealthy: string;
	readonly healthDegraded: string;
	readonly healthLocks: string;
	readonly healthStale: string;
	readonly healthQueue: string;
	readonly serverRestartHint: string;
	readonly [key: string]: string;
}
/** Resolve settings copy through the normal dictionary fallback boundary. */
export declare const settingsTranslations: (
	dict: ILangDict,
) => ISettingsTranslations;
/**
 * Dev-preview chrome translations. Only consumed by the
 * `extensions/vscode` dev entry (`:5200`) so the dashboard mock fallback,
 * the welcome screen, the Quick start menu and the dev-only tool-detail
 * + metrics panels render in the user's chosen language. Production
 * webviews never reach these strings.
 */
export interface IDevTranslations {
	readonly quickStartHeading: string;
	readonly quickStartLede: string;
	readonly quickStartDismiss: string;
	readonly firstRunHeading: string;
	readonly firstRunLede: string;
	readonly firstRunSkip: string;
	readonly firstRunInstall: string;
}
/** Placeholder for future tool-result translations (S5+). */
export interface IToolTranslations {
	readonly [toolName: string]: string | undefined;
}
/**
 * `ILangDict` — the unified dictionary shape every language file in
 * `apps/shared/src/i18n/langs/` exports. Sections are filled by S2.
 */
export interface ILangDict {
	readonly site: ISiteTranslations;
	readonly extension: IExtensionTranslations;
	readonly dev: IDevTranslations;
	readonly tools: IToolTranslations;
}
/**
 * `LangDictByLang` — the full map keyed by `Lang`. Filled by S2 via
 * `apps/shared/src/i18n/index.ts`. The runtime resolver
 * (`dictsByLang[lang].extension.openDashboard`) sits on top of this.
 */
export type LangDictByLang = Readonly<Record<Lang, ILangDict>>;
/**
 * `t(dict, path, vars?)` — looks up `dict[path[0]][path[1]]…` and
 * interpolates `{key}` placeholders with `vars[key]`. Returns the raw
 * key when the path is unresolved so a missing translation never blanks
 * the UI.
 */
export declare const t: (
	dict: ILangDict | undefined,
	path: readonly string[],
	vars?: Readonly<Record<string, string | number>>,
) => string;
