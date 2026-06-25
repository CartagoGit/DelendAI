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
//
// The `Lang` type is derived from a bare `as const` array (`languageCodes`)
// declared BEFORE `ILangMeta`. This deliberately breaks the cycle
//   `ILangMeta → Lang → languages satisfies readonly ILangMeta[] → ILangMeta`
// that TypeScript otherwise reports with `TS2456: Type alias 'Lang'
// circularly references itself`. The same fix is already in place in
// `apps/shared/src/i18n/shared.ts`; keep both copies in lockstep.

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

export interface ILangMeta {
	readonly code: Lang;
	readonly label: string;
	/** ISO 3166 country code used to resolve the flag SVG at `public/flags/<country>.svg`. */
	readonly flag: string;
}

/** Languages with a full translation (selectable in the config modal). */
export const languages: readonly ILangMeta[] = [
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
];

/** Right-to-left languages (need `dir="rtl"`). */
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

// ─── Translation shape (the contract) ────────────────────────────────────────

export interface INavTranslations {
	readonly concept: string;
	readonly install: string;
	readonly setup: string;
	readonly capabilities: string;
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
}

export interface IPageSection {
	readonly title: string;
	readonly lead: string;
	readonly count: string;
}

export interface IKnowledgeTranslations extends IPageSection {}

export interface IPromptsTranslations extends IPageSection {
	readonly arg: string;
}

export interface IResourcesTranslations extends IPageSection {
	readonly uri: string;
	readonly mime: string;
}

export interface ISkillsTranslations extends IPageSection {
	readonly body: string;
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
	readonly excludeHelp: string;
	/** f00048 — expanded install matrix. */
	readonly tabsPackageManager: string;
	readonly tabsIde: string;
	readonly tabsPreset: string;
	readonly pmStep1Title: string;
	readonly pmStep1Body: string;
	readonly pmStep2Title: string;
	readonly pmStep2Body: string;
	readonly pmRecommend: string;
	readonly ideFileLabel: string;
	readonly ideScopeLabel: string;
	readonly ideScopeProject: string;
	readonly ideScopeGlobal: string;
	readonly ideScopeBoth: string;
	readonly ideWhyLabel: string;
	readonly ideWhyBody: string;
	readonly presetSizeLabel: string;
	readonly presetUseLabel: string;
	readonly presetPluginsLabel: string;
	readonly presetFoot: string;
	readonly copy: string;
	readonly copied: string;
	readonly faqTitle: string;
	readonly faqQ1: string;
	readonly faqA1: string;
	readonly faqQ2: string;
	readonly faqA2: string;
	readonly faqQ3: string;
	readonly faqA3: string;
}

/**
 * Cross-project setup wizard (`/setup`, f00030 S3). Mirrors the 7 canonical
 * steps in `docs/mcp-vertex/CROSS-PROJECT-SETUP.md`; one `*Title`/`*Body` pair per step.
 */
export interface ISetupTranslations {
	readonly title: string;
	readonly lead: string;
	readonly stepsTitle: string;
	readonly docsLinkLabel: string;
	readonly detectRepoTitle: string;
	readonly detectRepoBody: string;
	readonly confirmRepoTitle: string;
	readonly confirmRepoBody: string;
	readonly pickAuthTierTitle: string;
	readonly pickAuthTierBody: string;
	readonly writeConfigTitle: string;
	readonly writeConfigBody: string;
	readonly verifyTierTitle: string;
	readonly verifyTierBody: string;
	readonly printInvocationTitle: string;
	readonly printInvocationBody: string;
	readonly markConfiguredTitle: string;
	readonly markConfiguredBody: string;
	readonly optionalLabel: string;
}

/** f00048 — generic UI primitives copy (CodeBlock, Tabs, Callout, Stepper, CopyButton). */
export interface IUiTranslations {
	readonly codeCopy: string;
	readonly codeCopied: string;
	readonly codeCollapse: string;
	readonly codeExpand: string;
	readonly calloutNote: string;
	readonly calloutTip: string;
	readonly calloutWarn: string;
	readonly calloutDanger: string;
	readonly tabsNext: string;
	readonly tabsPrev: string;
	readonly stepsOf: string;
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

export interface ISearchTranslations {
	readonly title: string;
	readonly placeholder: string;
}

export interface IFooterTranslations {
	readonly built: string;
	readonly tagline: string;
	readonly sections: string;
	readonly resources: string;
	readonly madeBy: string;
	readonly creatorsRepo: string;
	readonly creatorsNpm: string;
}

export interface IPluginPageTranslations {
	readonly back: string;
	readonly tools: string;
	readonly install: string;
	/** Tab labels for the plugin page strip (l100 s8). */
	readonly tabInstall: string;
	readonly tabTools: string;
	readonly tabConfiguration: string;
	readonly tabTutorial: string;
}

/** Per-tool detail page (`/tools/<plugin>/<tool>`, l030 S1). */
export interface IToolPageTranslations {
	readonly back: string;
	readonly backToPlugin: string;
	readonly arguments: string;
	readonly argName: string;
	readonly argType: string;
	readonly argRequired: string;
	readonly argDescription: string;
	readonly argRequiredYes: string;
	readonly argRequiredNo: string;
	readonly noArguments: string;
	readonly effects: string;
	readonly effectReadOnly: string;
	readonly example: string;
	readonly exampleNote: string;
	readonly plugin: string;
}

/** Presets page (`/presets`, f00043 S3) — membership matrix for every preset. */
export interface IPresetsTranslations {
	readonly title: string;
	readonly lead: string;
	readonly summary: string;
	readonly hostOnlyChip: string;
	readonly installTitle: string;
	readonly installLead: string;
	readonly table: {
		readonly preset: string;
	};
}

export interface INotFoundTranslations {
	readonly code: string;
	readonly title: string;
	readonly lead: string;
	readonly homeCta: string;
	readonly toolsCta: string;
	readonly homeAria: string;
}

export interface IProposalGlossaryEntry {
	readonly label: string;
	readonly short: string;
	readonly long: string;
}

export interface IProposalGlossaryTranslations {
	readonly statuses: {
		readonly ready: IProposalGlossaryEntry;
		readonly in_progress: IProposalGlossaryEntry;
		readonly review: IProposalGlossaryEntry;
		readonly done: IProposalGlossaryEntry;
		readonly paused: IProposalGlossaryEntry;
		readonly blocked: IProposalGlossaryEntry;
		readonly retired: IProposalGlossaryEntry;
	};
	readonly kinds: {
		readonly feat: IProposalGlossaryEntry;
		readonly breaking: IProposalGlossaryEntry;
		readonly fix: IProposalGlossaryEntry;
		readonly refactor: IProposalGlossaryEntry;
		readonly perf: IProposalGlossaryEntry;
		readonly audit: IProposalGlossaryEntry;
		readonly chore: IProposalGlossaryEntry;
		readonly docs: IProposalGlossaryEntry;
		readonly test: IProposalGlossaryEntry;
		readonly infra: IProposalGlossaryEntry;
		readonly spike: IProposalGlossaryEntry;
		readonly legacy: IProposalGlossaryEntry;
		readonly plan: IProposalGlossaryEntry;
	};
}

export interface IRecoveryTranslations {
	readonly title: string;
	readonly lead: string;
	readonly empty: string;
	readonly agent: string;
	readonly task: string;
	readonly lastSeen: string;
	readonly missedBeats: string;
	readonly actions: string;
	readonly releaseLock: string;
	readonly forceReady: string;
}

/** "First 5 minutes" onboarding page (`/first-5-minutes`, l030 S3). */
export interface IFirstFiveMinutesProfile {
	readonly title: string;
	readonly intro: string;
	readonly steps: ReadonlyArray<string>;
}

export interface IFirstFiveMinutesTranslations {
	readonly title: string;
	readonly lead: string;
	readonly profileTabBunNode: string;
	readonly profileTabVscode: string;
	readonly profileTabClaude: string;
	readonly bunNode: IFirstFiveMinutesProfile;
	readonly vscode: IFirstFiveMinutesProfile;
	readonly claude: IFirstFiveMinutesProfile;
	readonly nextSteps: string;
	readonly nextToolsCta: string;
	readonly nextTroubleshootingCta: string;
}

/** Troubleshooting index + case page (`/troubleshooting`, l030 S4). */
export interface ITroubleshootingTranslations {
	readonly title: string;
	readonly lead: string;
	readonly symptom: string;
	readonly cause: string;
	readonly fix: string;
	readonly tags: string;
	readonly backToIndex: string;
	readonly closedBy: string;
	readonly empty: string;
}

export interface ILogsTranslations {
	readonly page_title: string;
	readonly lead: string;
	readonly empty: string;
	readonly filter_outcome: string;
	readonly filter_agent: string;
	readonly filter_task: string;
	readonly copyTask: string;
	readonly outcomes: {
		readonly ok: string;
		readonly failed: string;
		readonly timed_out: string;
		readonly cancelled: string;
		readonly dead: string;
		readonly idle: string;
		readonly unknown: string;
	};
	readonly columns: {
		readonly ts: string;
		readonly kind: string;
		readonly agent: string;
		readonly task: string;
		readonly outcome: string;
		readonly summary: string;
	};
}

/** Plugin descriptor keys: keep in sync with `apps/web/src/data/manifests/capabilities.json`. */
export type PluginKey =
	| 'proposals'
	| 'git'
	| 'memory'
	| 'search'
	| 'rules'
	| 'quality'
	| 'docs'
	| 'deps'
	| 'notification'
	| 'logs'
	| 'status-marker'
	| 'issues'
	| 'core';

export type IPluginTranslations = {
	readonly proposals: string;
	readonly git: string;
	readonly memory: string;
	readonly search: string;
	readonly rules: string;
	readonly quality: string;
	readonly docs: string;
	readonly deps: string;
	readonly notification: string;
	readonly logs: string;
	readonly 'status-marker': string;
	readonly core: string;
	readonly issues: {
		readonly description: string;
		readonly requires: string;
		readonly installSnippet: string;
	};
};

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
	readonly search: ISearchTranslations;
	readonly footer: IFooterTranslations;
	readonly pluginpage: IPluginPageTranslations;
	readonly plugin: IPluginTranslations;
	readonly toolpage: IToolPageTranslations;
	readonly firstFiveMinutes: IFirstFiveMinutesTranslations;
	readonly troubleshooting: ITroubleshootingTranslations;
	readonly notFound: INotFoundTranslations;
	readonly knowledge: IKnowledgeTranslations;
	readonly prompts: IPromptsTranslations;
	readonly resources: IResourcesTranslations;
	readonly skills: ISkillsTranslations;
	readonly proposals: IProposalGlossaryTranslations;
	readonly recovery: IRecoveryTranslations;
	readonly logs: ILogsTranslations;
	readonly presets: IPresetsTranslations;
	readonly setup: ISetupTranslations;
	readonly ui: IUiTranslations;
}

/** Per-language dictionary type. A language file must default-export a value assignable to this. */
export type LangDict = ITranslations;

// ─── Resolving a dictionary for a given language ─────────────────────────────

/**
 * Deep-merge `dict` over `fallback` (typically English), so any leaf missing
 * from `dict` is silently taken from `fallback`. We don't fail loudly here
 * because the i18n completeness gate (`scripts/check-i18n.ts`) catches
 * missing keys at build time; runtime just needs something to render.
 */
const resolve = (dict: LangDict, fallback: LangDict): ITranslations => {
	const merge = (a: unknown, b: unknown): unknown => {
		if (typeof a === 'string') return a;
		if (typeof b === 'string') return b;
		// Arrays (e.g. `firstFiveMinutes.<profile>.steps`) are leaf values, not
		// objects to merge key-by-key — `Object.keys([...])` would otherwise
		// yield numeric-string indices and silently turn the array into a
		// plain object (`{0: ..., 1: ...}`), breaking every `.map()` call site.
		// `a` (the active language) always wins when both are arrays; `b`
		// (English) is the fallback only when `a` is missing entirely.
		if (Array.isArray(a)) return a;
		if (Array.isArray(b)) return b;
		if (a && b && typeof a === 'object' && typeof b === 'object') {
			const out: Record<string, unknown> = {};
			const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
			for (const k of keys) {
				out[k] = merge(
					(a as Record<string, unknown>)[k],
					(b as Record<string, unknown>)[k],
				);
			}
			return out;
		}
		return a ?? b;
	};
	return merge(dict, fallback) as ITranslations;
};

/**
 * Resolve the translations for `lang`. Returns the nested object directly so
 * templates can write `t.hero.title.a` instead of `t('hero.title.a')` — every
 * call site is then type-checked against `ITranslations`, autocompleted by
 * the IDE, and refactor-safe.
 */
export const useTranslations = (lang: Lang): ITranslations => {
	const dict = dictsByLang[lang] ?? dictsByLang[defaultLang];
	return resolve(dict, dictsByLang[defaultLang]);
};

/**
 * Map of every loaded language to its raw (un-resolved) dictionary. Populated
 * by `./index.ts` which imports `./langs/<code>.ts` for each entry of
 * `languages`.
 */
export const dictsByLang: Readonly<Record<Lang, LangDict>> = {} as Record<
	Lang,
	LangDict
>;
