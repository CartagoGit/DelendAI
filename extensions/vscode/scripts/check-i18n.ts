/**
 * i18n completeness gate for the extension's i18n surface.
 *
 * f00047 S6: the extension no longer ships its own language files; the
 * shared `apps/shared/src/i18n/langs/*.ts` is the single source of truth
 * for every consumer (this extension, the docs site, every future host).
 * This gate validates that the shared `extension` section of `ILangDict`
 * is complete (12 langs \u00d7 N keys, zero missing, zero stale).
 *
 * Run with `bun run check:i18n` from `extensions/vscode/`.
 *
 * Flags (f00059 S2):
 *   --strict   Exit with code 1 on any problem. Default is warn-only
 *              (exit 0 but print every missing/stale key).
 */
import { dictsByLang, languages, type Lang } from '../src/i18n';

const strictMode = process.argv.includes('--strict');

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

const enExt = dictsByLang.en?.extension as unknown;
if (!enExt) {
	console.error('\u2717 vscode i18n: shared `en.extension` is empty');
	process.exit(1);
}
const enKeys = flattenKeys(enExt);
const enKeysSet = new Set(enKeys);
const problems: string[] = [];

for (const { code } of languages) {
	const lang = code as Lang;
	const ext = dictsByLang[lang]?.extension as unknown;
	if (!ext) {
		problems.push(`[${code}] no \`extension\` section`);
		continue;
	}
	const extKeys = new Set(flattenKeys(ext));
	const missing = enKeys.filter((k) => !extKeys.has(k));
	if (missing.length > 0) {
		problems.push(`[${lang}] missing ${missing.join(', ')}`);
	}
	if (code !== 'en') {
		const extra = [...extKeys].filter((k) => !enKeysSet.has(k));
		if (extra.length > 0) {
			problems.push(`[${lang}] stale ${extra.join(', ')}`);
		}
	}
}

if (problems.length > 0) {
	console.error('\u2717 vscode i18n incomplete');
	for (const problem of problems) console.error(`  ${problem}`);
	if (strictMode) process.exit(1);
	console.warn(
		`\n\u26a0 warn-only mode (f00059 S2): pass --strict to fail the build.`,
	);
}

console.log(
	`\u2713 vscode i18n complete: ${languages.length} languages \u00d7 ${enKeys.length} keys.`,
);
