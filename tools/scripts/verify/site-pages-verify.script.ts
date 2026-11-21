#!/usr/bin/env bun
/**
 * site-pages-verify.script.ts — a00059 (delivery_verifier gate).
 *
 * `bun run site` (and CI's `site` job) builds `apps/web` as a static
 * site. Three page routes (`pages/tools/[plugin]/[tool].astro`,
 * `pages/[lang]/tools/[plugin]/[tool].astro`,
 * `pages/plugins/[plugin].astro`) rendered their body component
 * directly without wrapping it in `<Base>` — every tool-detail page
 * (76 tools × 12 languages) and every plugin-detail page (25, English
 * only) shipped as a bare content fragment: no `<html>`, `<head>`,
 * site nav, styles, or meta tags. Astro's own `check` command didn't
 * catch it (it type-checks, it doesn't inspect build output); the only
 * signal was Pagefind's indexer silently logging "has no <html>
 * element" 937 times without failing the build.
 *
 * This walks the real build output and fails loudly if any `.html`
 * file lacks an `<html` tag, so this exact regression can never again
 * ship silently. Pure engine (`verifySitePages`) + formatter + CLI
 * shell, same split as `cache-eviction-verify.script.ts` /
 * `dev-bundles-verify.script.ts`.
 *
 * Usage: `bun tools/scripts/verify/site-pages-verify.script.ts [buildDirAbs]`
 * (defaults to `build/apps/web`, the real `apps/web` build output per
 * `monorepo-paths.ts`). Must run AFTER `bun run site`'s astro build.
 */
import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

import { repoRoot } from '../lib/monorepo-paths';

export interface ISitePageFailure {
	readonly relPath: string;
	readonly bytes: number;
}

export interface ISitePagesVerifyResult {
	readonly ok: boolean;
	readonly pagesChecked: number;
	readonly failures: readonly ISitePageFailure[];
}

const walkHtml = async (
	root: string,
	dir: string,
	out: string[],
): Promise<void> => {
	const entries = await readdir(dir, { withFileTypes: true });
	for (const entry of entries) {
		const abs = join(dir, entry.name);
		if (entry.isDirectory()) {
			await walkHtml(root, abs, out);
		} else if (entry.isFile() && entry.name.endsWith('.html')) {
			out.push(abs);
		}
	}
};

/** Every built `.html` page must contain a real `<html` document root. */
export const verifySitePages = async (
	buildDirAbs: string,
): Promise<ISitePagesVerifyResult> => {
	const info = await stat(buildDirAbs).catch(() => null);
	if (info === null || !info.isDirectory()) {
		throw new Error(
			`site-pages-verify: build dir not found at ${buildDirAbs} — run \`bun run site\` (or the astro build step) first.`,
		);
	}
	const files: string[] = [];
	await walkHtml(buildDirAbs, buildDirAbs, files);
	const failures: ISitePageFailure[] = [];
	for (const abs of files) {
		const text = await readFile(abs, 'utf8');
		if (!text.includes('<html')) {
			failures.push({
				relPath: abs.slice(buildDirAbs.length + 1),
				bytes: Buffer.byteLength(text, 'utf8'),
			});
		}
	}
	return { ok: failures.length === 0, pagesChecked: files.length, failures };
};

const formatReport = (result: ISitePagesVerifyResult): string => {
	if (result.ok) {
		return `✓ site-pages-verify: ${result.pagesChecked} built pages all have a real <html> document root.\n`;
	}
	const sample = result.failures.slice(0, 10);
	const lines = sample.map((f) => `  ${f.relPath} (${f.bytes} bytes)`);
	const more =
		result.failures.length > sample.length
			? `\n  … and ${result.failures.length - sample.length} more`
			: '';
	return (
		`✖ site-pages-verify: ${result.failures.length}/${result.pagesChecked} built page(s) are missing an <html> root (bare content fragment, no layout):\n${lines.join('\n')}${more}\n\n` +
		`  The page's .astro route must wrap its body component in <Base lang={...}> (or a shell that already does, like PageShell) — see apps/web/src/pages/tools/[plugin]/[tool].astro for the canonical fix.\n`
	);
};

const main = async (): Promise<number> => {
	const buildDirAbs = process.argv[2] ?? join(repoRoot(), 'build/apps/web');
	const result = await verifySitePages(buildDirAbs);
	process.stderr.write(formatReport(result));
	return result.ok ? 0 : 1;
};

if (import.meta.main) process.exit(await main());
