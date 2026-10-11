/**
 * release-checkout.script.spec.ts — the rule is that nothing
 * unpublished is ever touched.
 *
 * This repository has already lost a human's uncommitted edit to a
 * blunt `git checkout -- .`, so the decision is pinned as a pure
 * function and driven with every shape the working tree can take: the
 * same content, different content, a file the publication never
 * carried, and a file that is simply not on disk.
 */

import { describe, expect, it } from 'vitest';

import { planRelease, renderVerdict } from './release-checkout.script';

const blobs =
	(table: Readonly<Record<string, string>>) =>
	(path: string): string | undefined =>
		table[path];

describe('planRelease', () => {
	it('releases only what is byte-for-byte what was published', () => {
		const plan = planRelease(
			['same.ts', 'edited.ts'],
			blobs({ 'same.ts': 'aaa', 'edited.ts': 'bbb' }),
			blobs({ 'same.ts': 'aaa', 'edited.ts': 'ccc' }),
		);

		expect(plan.release).toEqual(['same.ts']);
		// Somebody's unpublished work. Not restored, not discarded, named.
		expect(plan.keep).toEqual(['edited.ts']);
	});

	it('never touches a path the publication does not carry', () => {
		const plan = planRelease(
			['foreign.ts'],
			blobs({}),
			blobs({ 'foreign.ts': 'aaa' }),
		);

		expect(plan.release).toEqual([]);
		expect(plan.keep).toEqual(['foreign.ts']);
	});

	it('treats a missing working file as nothing to release', () => {
		const plan = planRelease(
			['gone.ts'],
			blobs({ 'gone.ts': 'aaa' }),
			blobs({}),
		);

		expect(plan.release).toEqual([]);
		expect(plan.keep).toEqual(['gone.ts']);
	});

	it('says what it left alone, so a dirty tree is never a surprise', () => {
		const text = renderVerdict({
			integration: 'origin/develop',
			released: ['a.ts'],
			kept: ['b.ts'],
		});

		expect(text).toContain('1 path(s) returned to origin/develop');
		expect(text).toContain('LEFT ALONE');
		expect(text).toContain('b.ts');
	});
});
