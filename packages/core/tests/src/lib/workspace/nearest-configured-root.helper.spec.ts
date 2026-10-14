/**
 * nearest-configured-root.helper.spec.ts — a server started inside a
 * workspace member serves the workspace.
 */
import { describe, expect, it } from 'vitest';

import { nearestConfiguredRoot } from '../../../../src/lib/workspace/nearest-configured-root.helper';

const tree =
	(paths: readonly string[]) =>
	async (path: string): Promise<boolean> =>
		paths.includes(path);

describe('nearestConfiguredRoot', () => {
	it('climbs from a member to the configured workspace', async () => {
		const exists = tree(['/repo/delendai.config.json', '/repo/.git']);
		expect(await nearestConfiguredRoot('/repo/packages/core', exists)).toBe(
			'/repo',
		);
		expect(await nearestConfiguredRoot('/repo', exists)).toBe('/repo');
	});

	it('stays where it started when the repository holds no configuration', async () => {
		expect(
			await nearestConfiguredRoot(
				'/repo/packages/core',
				tree(['/repo/.git']),
			),
		).toBe('/repo/packages/core');
	});

	it('never leaves the repository for a configuration above it', async () => {
		const exists = tree(['/srv/delendai.config.json', '/srv/repo/.git']);
		expect(await nearestConfiguredRoot('/srv/repo/src', exists)).toBe(
			'/srv/repo/src',
		);
	});

	it('stops at the filesystem root', async () => {
		expect(await nearestConfiguredRoot('/a/b', tree([]))).toBe('/a/b');
	});
});
