#!/usr/bin/env bun
/**
 * f00016 S12 — legacy frontmatter normalizer.
 *
 * Legacy `lNNN` proposals are historical imports. This script keeps their
 * frontmatter machine-readable without rewriting body prose into a fake modern
 * scaffold. Dry-run by default; pass `--apply` to write.
 */
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const walk = async (root: string): Promise<string[]> => {
	const out: string[] = [];
	for (const entry of await readdir(root, { withFileTypes: true }).catch(
		() => [],
	)) {
		const abs = join(root, entry.name);
		if (entry.isDirectory()) out.push(...(await walk(abs)));
		else if (entry.isFile() && /^l\d+-.*\.md$/.test(entry.name))
			out.push(abs);
	}
	return out;
};

const hasKey = (lines: readonly string[], key: string): boolean =>
	lines.some((line) => new RegExp(`^${key}:`).test(line));

export const normalizeLegacyMarkdown = (
	filename: string,
	markdown: string,
): { markdown: string; changed: boolean } => {
	const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---/);
	if (!match) return { markdown, changed: false };
	const inner = match[1] ?? '';
	const lines = inner.split(/\r?\n/);
	if (!hasKey(lines, 'kind')) lines.push('kind: legacy');
	if (!hasKey(lines, 'track')) lines.push('track: legacy');
	if (!hasKey(lines, 'date')) lines.push('date: 2026-06-20T00:00:00.000Z');
	if (!hasKey(lines, 'title')) {
		const slug = filename
			.replace(/^l\d+-/, '')
			.replace(/\.md$/, '')
			.replace(/-/g, ' ');
		lines.push(`title: Legacy proposal ${slug}`);
	}
	const next = `---\n${lines.join('\n')}\n---${markdown.slice(match[0].length)}`;
	return { markdown: next, changed: next !== markdown };
};

if (import.meta.main) {
	const repoRoot = join(fileURLToPath(new URL('..', import.meta.url)));
	const files = await walk(join(repoRoot, 'docs', 'proposals'));
	const apply = process.argv.includes('--apply');
	let changed = 0;
	for (const file of files) {
		const current = await readFile(file, 'utf8');
		const result = normalizeLegacyMarkdown(
			file.split('/').pop() ?? file,
			current,
		);
		if (!result.changed) continue;
		changed += 1;
		console.log(file);
		if (apply) await writeFile(file, result.markdown, 'utf8');
	}
	console.log(
		`${changed} legacy proposal(s) ${apply ? 'updated' : 'would change'}.`,
	);
}
