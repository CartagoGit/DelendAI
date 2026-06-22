/**
 * i18n completeness gate for the extension's i18n surface.
 *
 * f00047 S6: the extension no longer ships its own language files; the
 * shared `apps/shared/src/i18n/langs/*.ts` is the single source of truth
 * for every consumer (this extension, the docs site, every future host).
 * This gate validates that the shared `extension` section of `ILangDict`
 * is complete (12 langs × N keys, zero missing, zero stale).
 *
 * Run with `bun run check:i18n` from `extensions/vscode/`.
 */
import { dictsByLang, languages, type Lang } from '../src/i18n';

const en = dictsByLang.en?.extension as Record<string, string> | undefined;
if (!en) {
	console.error('✗ vscode i18n: shared `en.extension` is empty');
	process.exit(1);
}
const enKeys = Object.keys(en);
const problems: string[] = [];

for (const { code } of languages) {
	const lang = code as Lang;
	const ext = dictsByLang[lang]?.extension as
		| Record<string, string>
		| undefined;
	if (!ext) {
		problems.push(`[${code}] no \`extension\` section`);
		continue;
	}
	const missing = enKeys.filter((key) => !(key in ext));
	const extra = Object.keys(ext).filter((key) => !(key in en));
	if (missing.length > 0) {
		problems.push(`[${lang}] missing ${missing.join(', ')}`);
	}
	if (extra.length > 0) {
		problems.push(`[${lang}] stale ${extra.join(', ')}`);
	}
}

if (problems.length > 0) {
	console.error('✗ vscode i18n incomplete');
	for (const problem of problems) console.error(`  ${problem}`);
	process.exit(1);
}

console.log(
	`✓ vscode i18n complete: ${languages.length} languages × ${enKeys.length} keys.`,
);
