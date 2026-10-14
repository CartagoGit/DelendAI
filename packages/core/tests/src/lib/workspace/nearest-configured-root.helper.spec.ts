/**
 * nearest-configured-root.helper.spec.ts — a server started inside a
 * workspace member serves the workspace.
 */
import { describe, expect, it } from 'vitest';

import { nearestConfiguredRoot } from '../../../../src/lib/workspace/nearest-configured-root.helper';

const tree =
	(paths: readonly string[]) =>
	(path: string): boolean =>
		paths.includes(path);

describe('nearestConfiguredRoot', () => {
	it('climbs from a member to the configured workspace', () => {
		const exists = tree(['/repo/delendai.config.json', '/repo/.git']);
		expect(nearestConfiguredRoot('/repo/packages/core', exists)).toBe(
			'/repo',
		);
		expect(nearestConfiguredRoot('/repo', exists)).toBe('/repo');
	});

	it('stays where it started when the repository holds no configuration', () => {
		expect(
			nearestConfiguredRoot('/repo/packages/core', tree(['/repo/.git'])),
		).toBe('/repo/packages/core');
	});

	it('never leaves the repository for a configuration above it', () => {
		const exists = tree(['/home/delendai.config.json', '/home/repo/.git']);
		expect(nearestConfiguredRoot('/home/repo/src', exists)).toBe(
			'/home/repo/src',
		);
	});

	it('stops at the filesystem root', () => {
		expect(nearestConfiguredRoot('/a/b', tree([]))).toBe('/a/b');
	});
});
