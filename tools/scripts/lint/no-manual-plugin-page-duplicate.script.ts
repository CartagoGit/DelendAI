#!/usr/bin/env bun
/**
 * no-manual-plugin-page-duplicate.script.ts — d00014.
 *
 * `docs/delendai/plugins/{context-for-change,error-reporting,
 * impact-analysis}.md` used to be hand-written pages that duplicated
 * the auto-generated page for the same plugin id, with no drift check
 * between the two (AUD-F07). d00014 folded their content into the
 * auto-generated page's "## Notes" section (sourced from
 * `docs/delendai/plugins/notes/<id>.notes.md`) and replaced the
 * manual page with a short redirect stub, so each plugin has exactly
 * one canonical page again.
 *
 * This lint is the regression guard: it fails if a manual page under
 * `docs/delendai/plugins/<id>.md` reappears with real content (more
 * than a redirect stub) for a plugin id that already has an
 * auto-generated page. It intentionally allows the redirect stub
 * pattern (a short blockquote pointing at the auto-generated page and
 * the notes source) so old bookmarks/links don't 404.
 *
 * Usage:
 *   bun tools/scripts/lint/no-manual-plugin-page-duplicate.script.ts
 *   bun run lint:no-manual-plugin-page-duplicate
 *
 * Exit codes:
 *   0 — no manual page duplicates an auto-generated one.
 *   1 — at least one manual page duplicates content that belongs in
 *       the auto-generated page's Notes section instead.
 */
import { readdir, readFile } from 'node:fs/promises';

import { repoRoot } from '../lib/monorepo-paths';

export const PLUGINS_DOCS_DIR = 'docs/delendai/plugins';
export const AUTO_GENERATED_SUBDIR = 'auto-generated';

// Subdirectories under docs/delendai/plugins/ that are not
// per-plugin manual pages and must never be scanned as one.
const NON_MANUAL_SUBDIRS = new Set([
	'auto-generated',
	'notes',
	'authoring',
	'logs',
]);

const REDIRECT_MARKER = '> **Merged (d00014).**';
const MAX_STUB_LINES = 8;

export interface INoManualPluginPageDuplicateResult {
	readonly ok: boolean;
	readonly violations: readonly string[];
}

const isRedirectStub = (content: string): boolean => {
	const trimmed = content.trim();
	if (!trimmed.startsWith(REDIRECT_MARKER)) return false;
	return trimmed.split('\n').length <= MAX_STUB_LINES;
};

/**
 * Pure check: given the set of plugin ids with an auto-generated page
 * and the manual pages found directly under
 * `docs/delendai/plugins/*.md`, report any manual page whose id
 * matches an auto-generated one and is not a redirect stub.
 */
export const lintNoManualPluginPageDuplicate = (input: {
	readonly generatedIds: ReadonlySet<string>;
	readonly manualPages: Readonly<Record<string, string>>;
}): INoManualPluginPageDuplicateResult => {
	const violations: string[] = [];
	for (const [id, content] of Object.entries(input.manualPages)) {
		if (!input.generatedIds.has(id)) continue;
		if (isRedirectStub(content)) continue;
		violations.push(
			`${PLUGINS_DOCS_DIR}/${id}.md duplicates ${PLUGINS_DOCS_DIR}/${AUTO_GENERATED_SUBDIR}/${id}.md — ` +
				`fold the content into ${PLUGINS_DOCS_DIR}/notes/${id}.notes.md and let the generator inject it instead`,
		);
	}
	return { ok: violations.length === 0, violations };
};

const isMainModule = (): boolean => {
	const entry = process.argv[1];
	return entry !== undefined && import.meta.url === `file://${entry}`;
};

if (isMainModule()) {
	void (async () => {
		const root = repoRoot();
		const pluginsDirAbs = `${root}/${PLUGINS_DOCS_DIR}`;
		const generatedDirAbs = `${pluginsDirAbs}/${AUTO_GENERATED_SUBDIR}`;

		const generatedEntries = await readdir(generatedDirAbs, {
			withFileTypes: true,
		});
		const generatedIds = new Set(
			generatedEntries
				.filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
				.map((entry) => entry.name.replace(/\.md$/, '')),
		);

		const topEntries = await readdir(pluginsDirAbs, {
			withFileTypes: true,
		});
		const manualFiles = topEntries.filter(
			(entry) =>
				entry.isFile() &&
				entry.name.endsWith('.md') &&
				!NON_MANUAL_SUBDIRS.has(entry.name.replace(/\.md$/, '')),
		);

		const manualPages = Object.fromEntries(
			await Promise.all(
				manualFiles.map(async (entry) => {
					const id = entry.name.replace(/\.md$/, '');
					const text = await readFile(
						`${pluginsDirAbs}/${entry.name}`,
						'utf8',
					);
					return [id, text] as const;
				}),
			),
		);

		const result = lintNoManualPluginPageDuplicate({
			generatedIds,
			manualPages,
		});

		if (!result.ok) {
			for (const violation of result.violations) {
				console.error(
					`✖ no-manual-plugin-page-duplicate: ${violation}`,
				);
			}
			process.exit(1);
		}
		console.log(
			'✓ no-manual-plugin-page-duplicate: no manual plugin page duplicates its auto-generated page.',
		);
	})();
}
