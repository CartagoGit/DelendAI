import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';

import { PAGES_AUDIT } from './pages-audit';

const execFileAsync = promisify(execFile);
const workspaceRoot = fileURLToPath(new URL('../../../../', import.meta.url));
const verdictPattern = /^(keep|shelve|rewrite|merge-into-[a-z0-9-]+)$/;

const trackedPagePaths = async (): Promise<readonly string[]> => {
	const { stdout } = await execFileAsync(
		'git',
		[
			'ls-files',
			'apps/web/src/pages/*.astro',
			'apps/web/src/pages/**/*.astro',
		],
		{ cwd: workspaceRoot },
	);
	return Array.from(
		new Set(
			stdout
				.split('\n')
				.map((line) => line.trim())
				.filter((line) => line.length > 0),
		),
	).sort();
};

const pageSlug = (path: string): string =>
	path
		.replace(/^apps\/web\/src\/pages\//, '')
		.replace(/^\[lang\]\//, '')
		.replace(/\.astro$/, '')
		.replace(/\[([^\]]+)\]/g, '$1')
		.replace(/\//g, '-');

describe('PAGES_AUDIT', () => {
	let trackedPaths: readonly string[] = [];

	beforeAll(async () => {
		trackedPaths = await trackedPagePaths();
	});

	it('matches the tracked Astro page inventory on disk', () => {
		expect(PAGES_AUDIT).toHaveLength(trackedPaths.length);
		expect(PAGES_AUDIT.map((entry) => entry.path).sort()).toEqual(
			trackedPaths,
		);
	});

	it('requires a verdict and rationale for every entry', () => {
		for (const entry of PAGES_AUDIT) {
			expect(entry.verdict).toMatch(verdictPattern);
			expect(entry.why.trim().length).toBeGreaterThan(0);
		}
	});

	it('does not leave orphan merge targets', () => {
		const knownSlugs = new Set(
			PAGES_AUDIT.map((entry) => pageSlug(entry.path)),
		);

		for (const entry of PAGES_AUDIT) {
			if (!entry.verdict.startsWith('merge-into-')) continue;
			const ownSlug = pageSlug(entry.path);
			const targetSlug = entry.verdict.slice('merge-into-'.length);
			expect(targetSlug).not.toBe(ownSlug);
			expect(knownSlugs.has(targetSlug)).toBe(true);
		}
	});

	it('keeps a sane verdict mix', () => {
		const keeps = PAGES_AUDIT.filter((entry) => entry.verdict === 'keep');
		expect(keeps.length).toBeGreaterThan(0);
	});
});
