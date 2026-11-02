#!/usr/bin/env bun
/**
 * release-notes.script.ts — a version's GitHub Release notes are its
 * CHANGELOG section.
 *
 *   bun run release:notes --version=0.2.0
 *
 * `release:prepare` writes the section from the proposals the release
 * finished; the release workflow posts it. GitHub's own `--generate-notes`
 * lists pull requests, which is not what a reader of a release wants.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { repoRoot } from '../lib/repo-root';

/** The body of `version`'s section in `changelog`, or `undefined` when it has none. */
export const releaseNotes = (
	changelog: string,
	version: string,
): string | undefined => {
	const lines = changelog.split('\n');
	const start = lines.findIndex((line) => line.startsWith(`## [${version}]`));
	if (start === -1) return undefined;
	const rest = lines.slice(start + 1);
	const end = rest.findIndex((line) => line.startsWith('## '));
	return `${(end === -1 ? rest : rest.slice(0, end)).join('\n').trim()}\n`;
};

const main = (): number => {
	const version = process.argv
		.find((arg) => arg.startsWith('--version='))
		?.slice('--version='.length);
	if (version === undefined || version.length === 0) {
		console.error('✖ release:notes: pass --version=X.Y.Z.');
		return 1;
	}
	const notes = releaseNotes(
		readFileSync(join(repoRoot(), 'CHANGELOG.md'), 'utf8'),
		version,
	);
	if (notes === undefined) {
		console.error(
			`✖ release:notes: CHANGELOG.md has no section for ${version}; prepare it with \`bun run release:prepare --write\`.`,
		);
		return 1;
	}
	process.stdout.write(notes);
	return 0;
};

if (import.meta.main) process.exit(main());
