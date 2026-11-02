#!/usr/bin/env bun
/**
 * doc-links.script.ts — the root docs link only to what exists.
 *
 * The link-check plugin could find broken links and nothing ran it: the
 * root docs carried twenty-two links to files that had moved or been
 * removed. This runs the plugin's own checker over the tracked root
 * documents (the repository root, `docs/` and `docs/delendai/`, one level
 * each) and fails on any broken internal link or anchor.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { checkLinks, type ISourceDoc } from '@delendai/link-check/public';

/** The documents this gate owns: proposals and generated pages are not. */
const ROOT_DOC_RE = /^(?:docs\/(?:delendai\/)?)?[^/]+\.md$/u;

/** Every tracked path and each of its ancestor folders. */
export const knownPaths = (files: readonly string[]): ReadonlySet<string> => {
	const known = new Set<string>();
	for (const file of files) {
		let path = file;
		known.add(path);
		while (path.includes('/')) {
			path = path.slice(0, path.lastIndexOf('/'));
			known.add(path);
		}
	}
	return known;
};

export const rootDocs = (files: readonly string[]): readonly string[] =>
	files.filter((file) => ROOT_DOC_RE.test(file));

const main = (): number => {
	const root = execFileSync('git', ['rev-parse', '--show-toplevel'], {
		encoding: 'utf8',
	}).trim();
	const files = execFileSync('git', ['ls-files'], {
		cwd: root,
		encoding: 'utf8',
		maxBuffer: 64 * 1024 * 1024,
	})
		.split('\n')
		.filter((file) => file.length > 0);
	const docs: ISourceDoc[] = rootDocs(files).map((path) => ({
		path,
		content: readFileSync(join(root, path), 'utf8'),
	}));
	// A scan over nothing proves nothing.
	if (docs.length === 0) {
		console.error('✖ doc-links: no root document was found.');
		return 1;
	}
	const broken = checkLinks(docs, knownPaths(files)).filter(
		(finding) => finding.ruleId !== 'empty-link',
	);
	if (broken.length === 0) {
		console.log(
			`✓ doc-links: ${String(docs.length)} root documents, every internal link resolves.`,
		);
		return 0;
	}
	console.error(
		`✖ doc-links: ${String(broken.length)} broken link(s):\n${broken
			.slice(0, 30)
			.map(
				(finding) =>
					`  ${finding.location?.file}:${String(finding.location?.line)} ${finding.message}`,
			)
			.join(
				'\n',
			)}\n  Point the link at where the target lives now, or make it plain text.`,
	);
	return 1;
};

if (import.meta.main) process.exit(main());
