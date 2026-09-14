#!/usr/bin/env bun

/**
 * generate-docs-index — the guide index, generated so it cannot lie.
 *
 * WHY THIS IS GENERATED AND NOT WRITTEN. `DOCS-MANUAL-VS-GENERATED.md`
 * draws the line this repository already lives by: prose that takes
 * judgment is written, and every fact the repository can produce on
 * demand is generated. "Which guides exist" is squarely the second kind,
 * and the same document records what happens when an inventory is typed
 * by hand — two docs in one repo disagreeing about how many plugins
 * there are. A reading order is judgment and stays manual, above the
 * block; the list of files is not, and is rebuilt from the directory.
 *
 * SCOPE, deliberately narrow: the GUIDES — `docs/*.md` and
 * `docs/delendai/*.md`. Not proposals (1000+ files with their own
 * lifecycle and their own catalogue), not `docs/delendai/generated/`
 * (output, not documentation), not the auto-generated plugin pages
 * (`plugin-catalog.generated.md` already indexes those). An index that
 * lists everything indexes nothing.
 *
 *   bun run docs:index          rewrite the block
 *   bun run docs:index:check    fail when it is stale (CI)
 */

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { repoRoot } from '../lib/repo-root';

import {
	injectGeneratedBlock,
	renderMarkdownTable,
} from './generate-catalog.script';

import type { IDocEntry, IDocsIndexOutcome } from './docs-index.interface';

export type { IDocEntry, IDocsIndexOutcome } from './docs-index.interface';

export const DOCS_INDEX_PATH = 'docs/delendai/README.md';
export const DOCS_INDEX_START = '<!-- BEGIN GENERATED: docs-index -->';
export const DOCS_INDEX_END = '<!-- END GENERATED: docs-index -->';

/** The directories whose `*.md` are guides. Not recursive, on purpose. */
export const GUIDE_DIRECTORIES: readonly string[] = ['docs', 'docs/delendai'];

/** Never a guide: an index of itself, or generated output. */
export const NOT_A_GUIDE: readonly string[] = ['README.md'];

/**
 * The `# ` heading, or the filename when the file has none.
 *
 * Falling back to the filename rather than skipping the file matters:
 * a guide with no heading is still a guide, and an index that silently
 * omits it is worse than one that names it plainly.
 */
export const titleOf = (markdown: string, path: string): string => {
	for (const line of markdown.split('\n')) {
		if (line.startsWith('# ')) {
			return line
				.slice(2)
				.replace(/\s+—\s+[a-z]\d{5}.*$/u, '')
				.replace(/\s*\([a-z]\d{5}\)\s*$/u, '')
				.trim();
		}
	}
	return path.split('/').pop() ?? path;
};

/**
 * One line of what the guide is for.
 *
 * Prefers the blockquote many of these files open with, because that is
 * where their authors already put the summary; otherwise the first
 * ordinary sentence. Markdown that would break a table cell — pipes,
 * line breaks, links — is flattened by the caller's renderer.
 */
export const summaryOf = (markdown: string): string => {
	const lines = markdown.split('\n');
	const headingAt = lines.findIndex((line) => line.startsWith('# '));
	for (const line of lines.slice(headingAt + 1)) {
		const text = line.trim();
		if (text.length === 0) continue;
		if (text.startsWith('<!--') || text.startsWith('---')) continue;
		const prose = text.startsWith('> ') ? text.slice(2) : text;
		if (prose.startsWith('#')) return '';
		const sentence = prose.split(/(?<=\.)\s/u)[0] ?? prose;
		return sentence.replace(/\s+/gu, ' ').trim();
	}
	return '';
};

/**
 * Prose lifted out of another document, made safe to sit in a cell.
 *
 * Links are flattened to their text rather than kept, and that is a
 * correctness fix, not tidying: a relative link written for
 * `docs/delendai/CODE-MAP.md` resolves against a different directory
 * once it is copied into this page, so carrying it over would
 * manufacture broken links every time the index is regenerated.
 */
export const flattenMarkdown = (value: string): string =>
	value
		.replace(/!?\[([^\]]*)\]\([^)]*\)/gu, '$1')
		.replace(/\*\*/gu, '')
		.replace(/\|/gu, '\\|')
		.replace(/\r?\n/gu, ' ')
		.trim();

const cell = flattenMarkdown;

export const collectGuides = (root: string): readonly IDocEntry[] => {
	const entries: IDocEntry[] = [];
	for (const directory of GUIDE_DIRECTORIES) {
		let names: readonly string[] = [];
		try {
			names = readdirSync(join(root, directory), {
				withFileTypes: true,
			})
				.filter((item) => item.isFile() && item.name.endsWith('.md'))
				.map((item) => item.name);
		} catch {
			continue;
		}
		for (const name of [...names].sort()) {
			if (NOT_A_GUIDE.includes(name)) continue;
			const path = `${directory}/${name}`;
			const markdown = readFileSync(join(root, path), 'utf8');
			entries.push({
				path,
				title: titleOf(markdown, path),
				summary: summaryOf(markdown),
			});
		}
	}
	return entries;
};

/** The table, relative to `docs/delendai/` where the index lives. */
export const renderDocsIndex = (entries: readonly IDocEntry[]): string => {
	const rows = entries.map((entry) => [
		`[${cell(entry.title)}](${relativeToIndex(entry.path)})`,
		cell(entry.summary),
	]);
	return renderMarkdownTable(['Guide', 'What it covers'], rows);
};

/** `docs/delendai/X.md` → `X.md`; `docs/Y.md` → `../Y.md`. */
export const relativeToIndex = (path: string): string =>
	path.startsWith('docs/delendai/')
		? path.slice('docs/delendai/'.length)
		: `../${path.slice('docs/'.length)}`;

export const buildDocsIndex = (root: string): IDocsIndexOutcome => {
	const target = join(root, DOCS_INDEX_PATH);
	const current = readFileSync(target, 'utf8');
	const rendered = injectGeneratedBlock(
		current,
		DOCS_INDEX_START,
		DOCS_INDEX_END,
		renderDocsIndex(collectGuides(root)),
	);
	return { rendered, changed: rendered !== current };
};

export const main = (): number => {
	const check = process.argv.includes('--check');
	const root = repoRoot();
	const outcome = buildDocsIndex(root);
	if (!outcome.changed) {
		console.log('docs:index: up to date.');
		return 0;
	}
	if (check) {
		console.error(
			'docs:index: the guide index is stale. Run `bun run docs:index` and commit docs/delendai/README.md.',
		);
		return 1;
	}
	writeFileSync(join(root, DOCS_INDEX_PATH), outcome.rendered, 'utf8');
	console.log(`docs:index: rewrote ${DOCS_INDEX_PATH}.`);
	return 0;
};

if (import.meta.main) process.exit(main());
