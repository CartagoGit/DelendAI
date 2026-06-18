/**
 * i18n completeness gate.
 *
 * Enforces the maintenance rule: every UI string must be translated into EVERY
 * supported language. The English dict (`en`) is the source of truth; any other
 * language that is missing a key, or carries a stale key absent from `en`, fails
 * the build. Empty strings are allowed: some keys are sentence fragments that
 * legitimately have no counterpart in a given language (e.g. a trailing clause).
 *
 * Run standalone (`bun scripts/check-i18n.ts`) or as part of `build:strict`.
 */
import { dictsByLang, languages, type Lang } from '../src/i18n/ui';

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
