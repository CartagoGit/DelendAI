// Shared i18n metadata, types and helpers — single source of truth for
// the 12 canonical language dictionaries consumed by `@mcp-vertex/ui-extension`,
// `apps/web` and every host extension.
//
// In S1 this file is a stub that declares the new contract
// (`Lang`, `ILangDict`, helpers). S2 fills the per-language dictionaries
// under `apps/shared/src/i18n/langs/` by merging the existing
// `apps/web/src/i18n/langs/<code>.ts` (nested `site` shape) with the
// existing `extensions/vscode/src/i18n/langs/<code>.ts` (flat
// `extension` shape). Brand hex literals `#58a6ff` / `#a371f7` are
// allowed in this file as comments; the
// `tools/scripts/lint/no-duplicate-brand-hex.script.ts` rule
// permits them here for documentation purposes only.
//
// Note: the shape below intentionally mirrors the existing
// `apps/web/src/i18n/shared.ts` surface so the typecheck during the
// rewire stays green and the migration is mechanical.

// ─── Language codes (the `Lang` literal type) ────────────────────────
//
// Defined first, with no dependency on `ILangMeta`, to break the cycle
// `ILangMeta → Lang → languages satisfies ILangMeta → ILangMeta`.
export const languageCodes = [
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

export type Lang = (typeof languageCodes)[number];

// ─── Language metadata (depends on `Lang` but `Lang` no longer depends on it) ─
export interface ILangMeta {
	readonly code: Lang;
	readonly label: string;
	/** ISO 3166 country code used to resolve the flag SVG. */
	readonly flag: string;
}

export const languages = [
	{ code: 'ar', label: 'العربية', flag: 'sa' },
	{ code: 'de', label: 'Deutsch', flag: 'de' },
	{ code: 'en', label: 'English', flag: 'gb' },
	{ code: 'es', label: 'Español', flag: 'es' },
	{ code: 'fr', label: 'Français', flag: 'fr' },
	{ code: 'hi', label: 'हिन्दी', flag: 'in' },
	{ code: 'it', label: 'Italiano', flag: 'it' },
	{ code: 'ja', label: '日本語', flag: 'jp' },
	{ code: 'pt', label: 'Português', flag: 'pt' },
	{ code: 'th', label: 'ไทย', flag: 'th' },
	{ code: 'vi', label: 'Tiếng Việt', flag: 'vn' },
	{ code: 'zh', label: '中文', flag: 'cn' },
] as const satisfies readonly ILangMeta[];

export const rtlLangs: readonly Lang[] = ['ar'];

export const defaultLang: Lang = 'en';

export const themes = [
	'dark',
	'light',
	'midnight',
	'solarized',
	'nord',
] as const;
export type Theme = (typeof themes)[number];

export const flagFor = (lang: Lang): string =>
	languages.find((l: ILangMeta) => l.code === lang)?.flag ?? 'gb';

// ─── Translation shape (the contract) ──────────────────────────────────
//
// `ILangDict` is the **single** dictionary shape every consumer
// agrees on. Three top-level sections:
//
//   - `site`      — the existing nested site dict (`apps/web`).
//   - `extension` — the existing flat extension dict (`extensions/vscode`).
//   - `tools`     — placeholder for future tool-result translations.
//
// The S2 migration merges each existing pair of dicts into the unified
// shape; downstream code continues to import the section it needs.

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
	// S2 fills the full site shape here by re-exporting the existing
	// `ITranslations` from `apps/web/src/i18n/shared.ts`. For S1 the
	// type is intentionally permissive so the typecheck stays green
	// before the merge lands.
	readonly [section: string]: unknown;
}

/** Flat extension translations — the existing `extensions/vscode/src/i18n/index.ts#IExtensionTranslations` shape, lifted verbatim. */
export interface IExtensionTranslations {
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
	// S5 adds toolbar categories here.
	readonly [key: string]: string;
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
	readonly tools: IToolTranslations;
}

/**
 * `LangDictByLang` — the full map keyed by `Lang`. Filled by S2 via
 * `apps/shared/src/i18n/index.ts`. The runtime resolver
 * (`dictsByLang[lang].extension.openDashboard`) sits on top of this.
 */
export type LangDictByLang = Readonly<Record<Lang, ILangDict>>;

// ─── helpers ───────────────────────────────────────────────────────────

/**
 * `t(dict, path, vars?)` — looks up `dict[path[0]][path[1]]…` and
 * interpolates `{key}` placeholders with `vars[key]`. Returns the raw
 * key when the path is unresolved so a missing translation never blanks
 * the UI.
 */
export const t = (
	dict: ILangDict | undefined,
	path: readonly string[],
	vars?: Readonly<Record<string, string | number>>,
): string => {
	if (dict === undefined) return path.join('.');
	let cur: unknown = dict;
	for (const seg of path) {
		if (
			cur &&
			typeof cur === 'object' &&
			seg in (cur as Record<string, unknown>)
		) {
			cur = (cur as Record<string, unknown>)[seg];
		} else {
			return path.join('.');
		}
	}
	if (typeof cur !== 'string') return path.join('.');
	if (vars === undefined) return cur;
	return cur.replace(/\{(\w+)\}/g, (_, key: string) => {
		const v = vars[key];
		return v === undefined ? `{${key}}` : String(v);
	});
};

// Reference brand hex (allowed by lint:brand-hex in this file only):
// `#58a6ff` (blue) and `#a371f7` (purple) — defined canonically in
// `_themes.scss`. Anything other than this comment referencing those
// literals will fail `bun run lint:brand-hex`.
