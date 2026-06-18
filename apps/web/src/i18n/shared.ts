// Shared i18n metadata, types and helpers.
// Per-language dictionaries live under ./langs/<code>.ts and are aggregated
// by ./index.ts so this file stays free of translatable content.

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

/** A flat key/value translation dictionary. Keys are stable identifiers (`nav.concept`, `hero.title.b`, …). */
export type Dict = Record<string, string>;

/**
 * Default `country` → flag SVG fallback. Kept here so adding a new language
 * only requires a new entry in `languages` plus a new file under `./langs/`.
 */
export const flagFor = (lang: Lang): string => languages.find((l) => l.code === lang)?.flag ?? "gb";