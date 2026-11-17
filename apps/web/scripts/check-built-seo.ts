#!/usr/bin/env bun
/**
 * check-built-seo.ts — x00980 S2 (D12, G137). Fails when a built HTML page
 * lacks exactly one h1, a canonical link, or an hreflang per locale.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { WELL_KNOWN } from '../../../tools/scripts/lib/monorepo-paths.ts';
import { languages } from '../src/i18n/shared.ts';

/** Redirect stubs (meta refresh) and the 404 page are not content pages. */
const isExempt = (html: string): boolean =>
	/http-equiv=["']refresh["']/i.test(html) || /<title>\s*404/i.test(html);

export const seoProblems = (
	html: string,
	locales: readonly string[],
): string[] => {
	if (isExempt(html)) return [];
	const problems: string[] = [];
	const h1s = (html.match(/<h1[\s>]/gi) ?? []).length;
	if (h1s !== 1) problems.push(`${h1s} h1 (want 1)`);
	if (!/<link[^>]+rel=["']canonical["']/i.test(html))
		problems.push('no canonical');
	for (const code of locales) {
		const re = new RegExp(`<link[^>]+hreflang=["']${code}["']`, 'i');
		if (!re.test(html)) problems.push(`no hreflang ${code}`);
	}
	return problems;
};

export const htmlFiles = (dir: string): string[] =>
	readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
		e.isDirectory()
			? e.name === 'pagefind' || e.name === 'api'
				? []
				: htmlFiles(join(dir, e.name))
			: e.name.endsWith('.html')
				? [join(dir, e.name)]
				: [],
	);

/** Checks every built page under `root`; returns the page count and one line per failing page. */
export const checkBuiltSeo = (
	root: string,
	locales: readonly string[],
): { readonly pages: number; readonly failures: string[] } => {
	const files = htmlFiles(root);
	const failures = files.flatMap((f) => {
		const p = seoProblems(readFileSync(f, 'utf8'), locales);
		return p.length > 0 ? [`${f}: ${p.join(', ')}`] : [];
	});
	return { pages: files.length, failures };
};

if (import.meta.main) {
	const root = WELL_KNOWN.webApp();
	const { pages, failures } = checkBuiltSeo(
		root,
		languages.map((l) => l.code),
	);
	if (pages === 0) {
		console.error(`check-built-seo: no built pages under ${root}`);
		process.exit(1);
	}
	for (const f of failures) console.error(f);
	if (failures.length > 0) process.exit(1);
	console.log(`check-built-seo: ${pages} pages ok`);
}
