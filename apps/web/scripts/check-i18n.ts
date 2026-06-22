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
 */
import { dictsByLang, languages, type Lang } from '../src/i18n/ui';
import { listRegisteredTools } from '../src/i18n/tools';

const en = dictsByLang.en;
const enKeys = Object.keys(en);
const problems: string[] = [];

for (const { code } of languages) {
	const lang = code as Lang;
	const dict = dictsByLang[lang];
	if (!dict) {
		problems.push(`[${lang}] no dictionary registered`);
		continue;
	}
	const missing = enKeys.filter((k) => !(k in dict));
	if (missing.length)
		problems.push(
			`[${lang}] missing ${missing.length} keys: ${missing.join(', ')}`,
		);
}

// Also flag keys present in a translation but unknown in `en` (stale keys).
for (const { code } of languages) {
	const lang = code as Lang;
	const dict = dictsByLang[lang];
	if (!dict || lang === 'en') continue;
	const extra = Object.keys(dict).filter((k) => !(k in en));
	if (extra.length)
		problems.push(`[${lang}] stale keys not in en: ${extra.join(', ')}`);
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
		'✗ i18n incomplete — every language must translate every key:\n',
	);
	for (const p of problems) console.error(`  ${p}`);
	console.error(
		`\n${languages.length} languages · ${enKeys.length} keys each expected.`,
	);
	process.exit(1);
}

console.log(
	`✓ i18n complete: ${languages.length} languages × ${enKeys.length} keys.`,
);

// f00047 S6 — validate the SHARED i18n module too. The shared module is
// the single source of truth for every consumer (`@mcp-vertex/ui-extension`,
// `apps/web`, every host extension). The site-side check above is a
// per-consumer check; this is the source-of-truth check. The keys here
// are flattened from the `site`, `extension`, and `tools` sections.
import { dictsByLang as sharedDicts } from '@mcp-vertex/shared/i18n';
import { languages as sharedLanguages } from '@mcp-vertex/shared/i18n';

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

const sharedEn = sharedDicts.en as unknown as Record<string, unknown>;
const sharedEnKeys = flattenKeys(sharedEn);
const sharedProblems: string[] = [];

for (const lang of sharedLanguages) {
	const dict = (sharedDicts as Record<string, Record<string, unknown>>)[
		lang.code
	];
	if (!dict) {
		sharedProblems.push(`[shared:${lang.code}] no dictionary registered`);
		continue;
	}
	const dictKeys = new Set(flattenKeys(dict));
	const missing = sharedEnKeys.filter((k) => !dictKeys.has(k));
	if (missing.length) {
		sharedProblems.push(
			`[shared:${lang.code}] missing ${missing.length} keys: ${missing.join(', ')}`,
		);
	}
}

if (sharedProblems.length) {
	console.error(
		'\n✗ shared i18n incomplete — every language must translate every key:\n',
	);
	for (const p of sharedProblems) console.error(`  ${p}`);
	console.error(
		`\n${sharedLanguages.length} languages · ${sharedEnKeys.length} keys each expected.`,
	);
	process.exit(1);
}

console.log(
	`✓ shared i18n complete: ${sharedLanguages.length} languages × ${sharedEnKeys.length} keys.`,
);
