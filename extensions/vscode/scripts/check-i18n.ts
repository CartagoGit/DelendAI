import { dictsByLang, languages, type Lang } from '../src/i18n';

const en = dictsByLang.en;
const enKeys = Object.keys(en);
const problems: string[] = [];

for (const lang of languages) {
	const dict = dictsByLang[lang as Lang];
	const missing = enKeys.filter((key) => !(key in dict));
	const extra = Object.keys(dict).filter((key) => !(key in en));
	if (missing.length > 0) {
		problems.push(`[${lang}] missing ${missing.join(', ')}`);
	}
	if (extra.length > 0) {
		problems.push(`[${lang}] stale ${extra.join(', ')}`);
	}
}

if (problems.length > 0) {
	console.error('x vscode i18n incomplete');
	for (const problem of problems) console.error(`  ${problem}`);
	process.exit(1);
}

console.log(
	`✓ vscode i18n complete: ${languages.length} languages × ${enKeys.length} keys.`,
);
