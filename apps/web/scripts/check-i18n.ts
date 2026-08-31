/**
 * i18n completeness gate.
 *
 * Enforces the maintenance rule: every UI string must be translated into EVERY
 * supported language. The English dict (`en`) is the source of truth; any other
 * language that is missing a key, or carries a stale key absent from `en`, fails
 * the build. Empty strings are allowed: some keys are sentence fragments that
 * legitimately have no counterpart in a given language (e.g. a trailing clause).
 *
 * Additionally, every catalogue entry that opted in via
 * `apps/web/src/i18n/tools/index.ts` (per-tool i18n) must carry 12-lang
 * `description`. Tools NOT in the catalogue are exempt: joining the catalogue
 * is opt-in, and once you join you commit to 12-lang. See l100 s3-bis.
 *
 * Run standalone (`bun scripts/check-i18n.ts`) or as part of `build:strict`.
 *
 * Flags (f00059 S2):
 *   --strict   Exit with code 1 on any problem. Default is warn-only (exit 0
 *              but print every missing/stale key). Used to land the
 *              recursive-walk gate before translators backfill the 12 langs.
 */
import { dictsByLang, languages, type Lang } from '../src/i18n/ui';
import { listRegisteredTools } from '../src/i18n/tools';
import {
	dictsByLang as sharedDicts,
	languages as sharedLanguages,
} from '@mcp-vertex/shared/i18n';
import rawSharedEn from '../../shared/src/i18n/langs/en';
import rawSharedEs from '../../shared/src/i18n/langs/es';

export type CheckMode = 'warn' | 'strict';

export const resolveCheckMode = (argv: readonly string[]): CheckMode =>
	argv.includes('--strict') ? 'strict' : 'warn';

const strictMode = resolveCheckMode(process.argv) === 'strict';

const flattenKeys = (root: unknown, prefix = ''): string[] => {
	if (root === null || root === undefined) return prefix ? [prefix] : [];
	if (typeof root !== 'object') return prefix ? [prefix] : [];
	if (Array.isArray(root)) return prefix ? [prefix] : [];
	const out: string[] = [];
	for (const [k, v] of Object.entries(root as Record<string, unknown>)) {
		const next = prefix ? `${prefix}.${k}` : k;
		if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
			out.push(...flattenKeys(v, next));
		} else {
			out.push(next);
		}
	}
	return out;
};

const flattenStrings = (
	root: unknown,
	prefix = '',
): ReadonlyMap<string, string> => {
	const out = new Map<string, string>();
	if (root === null || typeof root !== 'object' || Array.isArray(root)) {
		if (prefix && typeof root === 'string') out.set(prefix, root);
		return out;
	}
	for (const [key, value] of Object.entries(
		root as Record<string, unknown>,
	)) {
		const next = prefix ? `${prefix}.${key}` : key;
		for (const [path, text] of flattenStrings(value, next))
			out.set(path, text);
	}
	return out;
};

export interface I18nCheckInput {
	readonly siteDictsByLang: Record<string, unknown>;
	readonly siteLanguages: readonly { readonly code: string }[];
	readonly sharedDictsByLang: Record<string, unknown>;
	readonly sharedLanguages: readonly { readonly code: string }[];
	readonly registeredTools: readonly {
		readonly name: string;
		readonly dict: { readonly description: Record<string, unknown> };
	}[];
	readonly authoredEnglishExtension: unknown;
	readonly authoredSpanishExtension: unknown;
}

export interface I18nCheckResult {
	readonly siteProblems: readonly string[];
	readonly sharedProblems: readonly string[];
	readonly authoredProblems: readonly string[];
	readonly shouldFail: boolean;
}

export const runCheck = (
	input: I18nCheckInput,
	mode: CheckMode,
): I18nCheckResult => {
	const siteProblems: string[] = [];
	const siteEn = flattenKeys(input.siteDictsByLang.en ?? {});
	const siteEnSet = new Set(siteEn);
	for (const language of input.siteLanguages) {
		const dictionary = input.siteDictsByLang[language.code];
		if (dictionary === undefined) {
			siteProblems.push(`[${language.code}] no dictionary registered`);
			continue;
		}
		const keys = new Set(flattenKeys(dictionary));
		const missing = siteEn.filter((key) => !keys.has(key));
		if (missing.length > 0)
			siteProblems.push(
				`[${language.code}] missing ${missing.length}/${siteEn.length} keys: ${missing.join(', ')}`,
			);
		if (language.code !== 'en') {
			const extra = [...keys].filter((key) => !siteEnSet.has(key));
			if (extra.length > 0)
				siteProblems.push(
					`[${language.code}] stale keys not in en: ${extra.join(', ')}`,
				);
		}
	}

	const sharedProblems: string[] = [];
	const sharedEn = flattenKeys(input.sharedDictsByLang.en ?? {});
	const sharedEnSet = new Set(sharedEn);
	for (const language of input.sharedLanguages) {
		const dictionary = input.sharedDictsByLang[language.code];
		if (dictionary === undefined) {
			sharedProblems.push(
				`[shared:${language.code}] no dictionary registered`,
			);
			continue;
		}
		const keys = new Set(flattenKeys(dictionary));
		const missing = sharedEn.filter((key) => !keys.has(key));
		if (missing.length > 0)
			sharedProblems.push(
				`[shared:${language.code}] missing ${missing.length}/${sharedEn.length} keys: ${missing.join(', ')}`,
			);
		if (language.code !== 'en') {
			const extra = [...keys].filter((key) => !sharedEnSet.has(key));
			if (extra.length > 0)
				sharedProblems.push(
					`[shared:${language.code}] stale keys not in en: ${extra.join(', ')}`,
				);
		}
	}

	const authoredEnglish = flattenStrings(input.authoredEnglishExtension);
	const authoredSpanish = flattenStrings(input.authoredSpanishExtension);
	const authoredProblems = [
		...[...authoredEnglish.keys()].filter(
			(key) => !authoredSpanish.has(key),
		),
		...[...authoredSpanish.keys()].filter(
			(key) => !authoredEnglish.has(key),
		),
	];
	return {
		siteProblems,
		sharedProblems,
		authoredProblems,
		shouldFail:
			mode === 'strict' &&
			(siteProblems.length > 0 ||
				sharedProblems.length > 0 ||
				authoredProblems.length > 0),
	};
};

// ---- Site dict check (recursive walk, f00059 S2) ----
const en = dictsByLang.en as unknown as Record<string, unknown>;
const enKeys = flattenKeys(en);
const enKeysSet = new Set(enKeys);
const problems: string[] = [];

for (const { code } of languages) {
	const lang = code as Lang;
	const dict = dictsByLang[lang] as unknown as Record<string, unknown>;
	if (!dict) {
		problems.push(`[${lang}] no dictionary registered`);
		continue;
	}
	const dictKeys = new Set(flattenKeys(dict));
	const missing = enKeys.filter((k) => !dictKeys.has(k));
	if (missing.length)
		problems.push(
			`[${lang}] missing ${missing.length}/${enKeys.length} keys: ${missing.slice(0, 5).join(', ')}${missing.length > 5 ? '\u2026' : ''}`,
		);
	if (lang !== 'en') {
		const extra = [...dictKeys].filter((k) => !enKeysSet.has(k));
		if (extra.length)
			problems.push(
				`[${lang}] stale keys not in en: ${extra.slice(0, 5).join(', ')}${extra.length > 5 ? '\u2026' : ''}`,
			);
	}
}

// Per-tool catalogue entries (l100 s3-bis): once a tool opts in, every
// supported language must carry a non-empty `description`.
for (const { name, dict } of listRegisteredTools()) {
	const langsWithValue = languages
		.map((l) => l.code)
		.filter(
			(code) =>
				typeof dict.description[code] === 'string' &&
				(dict.description[code] as string).trim().length > 0,
		);
	const missingLangs = languages
		.map((l) => l.code)
		.filter((code) => !langsWithValue.includes(code));
	if (missingLangs.length > 0) {
		problems.push(
			`[tools:${name}] missing ${missingLangs.length} language(s): ${missingLangs.join(', ')}`,
		);
	}
}

if (problems.length) {
	console.error(
		'\u2717 i18n incomplete \u2014 every language must translate every key:\n',
	);
	for (const p of problems) console.error(`  ${p}`);
	console.error(
		`\n${languages.length} languages \u00b7 ${enKeys.length} keys each expected.`,
	);
	if (strictMode) process.exit(1);
	console.warn(
		`\n\u26a0 warn-only mode (f00059 S2): pass --strict to fail the build.`,
	);
}

console.log(
	`\u2713 i18n complete: ${languages.length} languages \u00d7 ${enKeys.length} keys.`,
);

// ---- Shared i18n check (recursive walk, f00047 S6 + f00059 S2) ----
// The shared module is the single source of truth for every consumer
// (`@mcp-vertex/ui-extension`, `apps/web`, every host extension). The
// site-side check above is a per-consumer check; this is the
// source-of-truth check. The keys are flattened from the `site`,
// `extension`, and `tools` sections.
const sharedEn = sharedDicts.en as unknown as Record<string, unknown>;
const sharedEnKeys = flattenKeys(sharedEn);
const sharedEnKeysSet = new Set(sharedEnKeys);
const sharedProblems: string[] = [];

for (const lang of sharedLanguages) {
	const dict = (
		sharedDicts as unknown as Record<string, Record<string, unknown>>
	)[lang.code];
	if (!dict) {
		sharedProblems.push(`[shared:${lang.code}] no dictionary registered`);
		continue;
	}
	const dictKeys = new Set(flattenKeys(dict));
	const missing = sharedEnKeys.filter((k) => !dictKeys.has(k));
	if (missing.length) {
		sharedProblems.push(
			`[shared:${lang.code}] missing ${missing.length}/${sharedEnKeys.length} keys: ${missing.slice(0, 5).join(', ')}${missing.length > 5 ? '\u2026' : ''}`,
		);
	}
	if (lang.code !== 'en') {
		const extra = [...dictKeys].filter((k) => !sharedEnKeysSet.has(k));
		if (extra.length) {
			sharedProblems.push(
				`[shared:${lang.code}] stale keys not in en: ${extra.slice(0, 5).join(', ')}${extra.length > 5 ? '\u2026' : ''}`,
			);
		}
	}
}

if (sharedProblems.length) {
	console.error(
		'\n\u2717 shared i18n incomplete \u2014 every language must translate every key:\n',
	);
	for (const p of sharedProblems) console.error(`  ${p}`);
	console.error(
		`\n${sharedLanguages.length} languages \u00b7 ${sharedEnKeys.length} keys each expected.`,
	);
	if (strictMode) process.exit(1);
	console.warn(
		`\n\u26a0 warn-only mode (f00059 S2): pass --strict to fail the build.`,
	);
}

console.log(
	`\u2713 shared i18n complete: ${sharedLanguages.length} languages \u00d7 ${sharedEnKeys.length} keys.`,
);

// Runtime fallback keeps partially-authored extension dictionaries usable,
// but it must not make the two fully-authored product locales look complete.
// Compare the raw modules before `withExtensionFallback(...)` is applied.
const authoredEnglish = flattenStrings(rawSharedEn.extension);
const authoredSpanish = flattenStrings(rawSharedEs.extension);
const spanishMissing = [...authoredEnglish.keys()].filter(
	(key) => !authoredSpanish.has(key),
);
const spanishExtra = [...authoredSpanish.keys()].filter(
	(key) => !authoredEnglish.has(key),
);
const allowedIdenticalSpanish = new Set([
	'tabTokens',
	'tabPlugins',
	'tabDocs',
	'kpiPlugins',
	'kpiTokens',
	'toolbarCategoryLogs',
	'toolbarCategoryDocs',
	'toolbarCategoryGit',
	'dashboard.tokens.usedHint',
	'settings.logLevel.error',
	'common.plugin',
	'common.id',
	// "Nord" is the theme's proper name — identical in every language.
	'settings.theme.nord',
	// Loanwords the Spanish copy uses verbatim throughout (see the
	// `workspace`/`plugins`/`logs` wording across `langs/es.ts`), matching
	// the already-allowed `tabPlugins` / `kpiPlugins` /
	// `toolbarCategoryLogs` entries above.
	'status.pluginsLabel',
	'tabLogs',
	'settings.section.workspace',
]);
const spanishStaleEnglish = [...authoredEnglish].flatMap(([key, value]) =>
	authoredSpanish.get(key) === value && !allowedIdenticalSpanish.has(key)
		? [key]
		: [],
);
if (
	spanishMissing.length > 0 ||
	spanishExtra.length > 0 ||
	spanishStaleEnglish.length > 0
) {
	console.error('\n✗ authored extension i18n incomplete for Spanish:');
	if (spanishMissing.length > 0) {
		console.error(`  missing: ${spanishMissing.join(', ')}`);
	}
	if (spanishExtra.length > 0) {
		console.error(`  stale: ${spanishExtra.join(', ')}`);
	}
	if (spanishStaleEnglish.length > 0) {
		console.error(`  untranslated: ${spanishStaleEnglish.join(', ')}`);
	}
	process.exit(1);
}
console.log(
	`✓ authored extension i18n complete: en + es × ${authoredEnglish.size} keys.`,
);
