/**
 * Specs for `publishedInFor` — when a work branch counts as published.
 *
 * The flow is: develop on a work branch, publish it as a pull request,
 * and delete the work branch. A work branch left behind is a stale second
 * copy that agents keep developing on, so the guard reports it as
 * reapable and fails until it is removed. These cases pin what "already
 * published" means, with the forge's ancestry check injected.
 */
import { describe, expect, it } from 'vitest';

import { publishedInFor } from './ref-lifecycle-guard.script';

const work = { name: 'delendai/wip/m/x1-S1-g1-topic', sha: 'aaa' };
const never = () => false;

describe('publishedInFor', () => {
	it('finds a publication ref at the same commit without asking the forge', () => {
		let asked = false;
		expect(
			publishedInFor(
				work,
				[{ name: 'delendai/pr/x1-topic', sha: 'aaa' }],
				() => {
					asked = true;
					return false;
				},
			),
		).toBe('delendai/pr/x1-topic');
		expect(asked).toBe(false);
	});

	it('finds a publication ref that moved past the work tip', () => {
		expect(
			publishedInFor(
				work,
				[{ name: 'delendai/pr/x1-topic', sha: 'bbb' }],
				(base, head) => base === 'bbb' && head === 'aaa',
			),
		).toBe('delendai/pr/x1-topic');
	});

	it('finds the integration branch once the work merged', () => {
		expect(
			publishedInFor(
				work,
				[{ name: 'develop', sha: 'ddd' }],
				(base) => base === 'ddd',
			),
		).toBe('develop');
	});

	it('is undefined while the work exists nowhere else', () => {
		expect(
			publishedInFor(
				work,
				[
					{ name: 'develop', sha: 'ddd' },
					{ name: 'delendai/pr/other', sha: 'eee' },
				],
				never,
			),
		).toBeUndefined();
	});

	it('is undefined with no containers at all', () => {
		expect(publishedInFor(work, [], never)).toBeUndefined();
	});
});
