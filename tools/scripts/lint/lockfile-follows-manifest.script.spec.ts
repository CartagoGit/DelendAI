import { describe, expect, it } from 'vitest';

import { lockfileWithoutManifest } from './lockfile-follows-manifest.script.ts';

describe('lockfileWithoutManifest', () => {
	it('names the lockfile changed alone', () => {
		expect(lockfileWithoutManifest(['bun.lock', 'src/a.ts'])).toEqual([
			'bun.lock',
		]);
	});

	it('accepts the lockfile with a root or workspace manifest', () => {
		expect(lockfileWithoutManifest(['bun.lock', 'package.json'])).toEqual(
			[],
		);
		expect(
			lockfileWithoutManifest(['bun.lock', 'packages/core/package.json']),
		).toEqual([]);
	});

	it('accepts a change that leaves the lockfile alone', () => {
		expect(lockfileWithoutManifest(['package.json', 'a.ts'])).toEqual([]);
		expect(lockfileWithoutManifest([])).toEqual([]);
	});
});
