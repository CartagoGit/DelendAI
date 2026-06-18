// Shared i18n metadata, types and helpers.
// Per-language dictionaries live under ./langs/<code>.ts and are aggregated
// by ./index.ts so this file stays free of translatable content.
//
// Translations are nested objects, not flat dot-strings: each section has its
// own interface (`INavTranslations`, `IHeroTranslations`, …) so TS reports a
// compile error if a key is missing, added without updating every language, or
// misspelled at a call site. The whole root shape is described by
// `ITranslations` and languages must satisfy it (`const dict: LangDict = { … }`).

// ─── Language metadata ────────────────────────────────────────────────────────

export interface ILangMeta {
	readonly code: Lang;
	readonly label: string;
	/** ISO 3166 country code used to resolve the flag SVG at `public/flags/<country>.svg`. */
	readonly flag: string;
}

/** Languages with a full translation (selectable in the config modal). */
export const languages = [
	{ code: "ar", label: "العربية", flag: "sa" },
	{ code: "de", label: "Deutsch", flag: "de" },
	{ code: "en", label: "English", flag: "gb" },
	{ code: "es", label: "Español", flag: "es" },
	{ code: "fr", label: "Français", flag: "fr" },
	{ code: "hi", label: "हिन्दी", flag: "in" },
	{ code: "it", label: "Italiano", flag: "it" },
	{ code: "ja", label: "日本語", flag: "jp" },
	{ code: "pt", label: "Português", flag: "pt" },
	{ code: "th", label: "ไทย", flag: "th" },
	{ code: "vi", label: "Tiếng Việt", flag: "vn" },
	{ code: "zh", label: "中文", flag: "cn" },
] as const satisfies readonly ILangMeta[];

export type Lang = (typeof languages)[number]["code"];

/** Right-to-left languages (need `dir="rtl"`). */
export const rtlLangs: readonly Lang[] = ["ar"];

export const defaultLang: Lang = "en";

export const themes = ["dark", "light", "midnight", "solarized", "nord"] as const;
export type Theme = (typeof themes)[number];

export const flagFor = (lang: Lang): string => languages.find((l) => l.code === lang)?.flag ?? "gb";

// ─── Translation shape (the contract) ────────────────────────────────────────

export interface INavTranslations {
	readonly concept: string;
	readonly install: string;
	readonly tools: string;
	readonly benchmarks: string;
	readonly plugins: string;
	readonly github: string;
}

export interface IHeroTitle {
	readonly a: string;
	readonly b: string;
	readonly c: string;
}

export interface IHeroTranslations {
	readonly title: IHeroTitle;
	readonly subheader: string;
	readonly tagline: string;
	readonly ctaInstall: string;
	readonly ctaTools: string;
	readonly runsOn: string;
}

export interface IMarqueeTranslations {
	readonly runtimes: string;
	readonly clients: string;
}

export interface IFeature {
	readonly t: string;
	readonly b: string;
}

export interface IConceptTranslations {
	readonly title: string;
	readonly body: string;
	readonly f1: IFeature;
	readonly f2: IFeature;
	readonly f3: IFeature;
	readonly f4: IFeature;
}

export interface IInstallTranslations {
	readonly title: string;
	readonly lead: string;
	readonly verify: string;
	readonly addto: string;
	readonly presets: string;
	readonly oneCmd: string;
	readonly oneCmdNote: string;
	readonly config: string;
}

export interface IToolsTranslations {
	readonly title: string;
	readonly lead: string;
	readonly count: string;
	readonly packages: string;
}

export interface IBenchTranslations {
	readonly title: string;
	readonly lead: string;
	readonly b1: IFeature;
	readonly b2: IFeature;
	readonly b3: IFeature;
	readonly live: { readonly title: string; readonly note: string };
	readonly baseline: string;
}

export interface IPluginsTranslations {
	readonly title: string;
	readonly lead: string;
}

export interface ICfgTranslations {
	readonly title: string;
	readonly theme: string;
	readonly language: string;
	readonly motion: string;
	readonly motionLabel: string;
}

export interface IFooterTranslations {
	readonly built: string;
}

export interface IPluginPageTranslations {
	readonly back: string;
	readonly tools: string;
	readonly install: string;
}

/** Plugin descriptor keys: keep in sync with `apps/web/src/data/capabilities.json`. */
export type PluginKey =
	| "proposals"
	| "git"
	| "memory"
	| "search"
	| "rules"
	| "quality"
	| "docs"
	| "deps"
	| "notification"
	| "core";

export type IPluginTranslations = Readonly<Record<PluginKey, string>>;

/** Root shape — every per-language dictionary must satisfy this. */
export interface ITranslations {
	readonly nav: INavTranslations;
	readonly hero: IHeroTranslations;
	readonly marquee: IMarqueeTranslations;
	readonly concept: IConceptTranslations;
	readonly install: IInstallTranslations;
	readonly tools: IToolsTranslations;
	readonly bench: IBenchTranslations;
	readonly plugins: IPluginsTranslations;
	readonly cfg: ICfgTranslations;
	readonly footer: IFooterTranslations;
	readonly pluginpage: IPluginPageTranslations;
	readonly plugin: IPluginTranslations;
}

/** Per-language dictionary type. A language file must default-export a value assignable to this. */
export type LangDict = ITranslations;

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Walk `path` through `dict` and return the leaf string (or `undefined` if missing). */
const walkPath = (dict: unknown, path: ReadonlyArray<string>): string | undefined => {
	let cur: unknown = dict;
	for (const seg of path) {
		if (cur && typeof cur === "object" && seg in (cur as Record<string, unknown>)) {
			cur = (cur as Record<string, unknown>)[seg];
		} else {
			return undefined;
		}
	}
	return typeof cur === "string" ? cur : undefined;
};

/**
 * Build a translator for `dict` that falls back to `fallback` (typically English)
 * when a key is missing, finally returning the joined path so missing keys are
 * visible at runtime rather than swallowed.
 *
 * Accepts both the variadic form (`t('nav', 'concept')`) and the dot-string
 * form (`t.nav.concept`); the dot-string form is kept for one release so the
 * migration of legacy `.astro` pages stays low-ceremony.
 */
export const makeTranslator = (dict: LangDict, fallback: LangDict) => {
	return (...raw: ReadonlyArray<string | undefined>): string => {
		const path = raw
			.flatMap((p) => (typeof p === "string" ? p.split(".") : []))
			.filter((s) => s.length > 0);
		return walkPath(dict, path) ?? walkPath(fallback, path) ?? path.join(".");
	};
};

export type Translator = ReturnType<typeof makeTranslator>;