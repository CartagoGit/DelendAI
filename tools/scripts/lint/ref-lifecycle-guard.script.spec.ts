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

import {
	blockingRefs,
	containedInGit,
	containsWith,
	publishedInFor,
} from './ref-lifecycle-guard.script';

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

/**
 * Containment is a fact about commits. Asking the forge for it once per
 * ref per container burned the secondary rate limit and ended the run
 * with an unhandled `Command failed` — a required check reading as a code
 * defect, on every open pull request at once.
 */
describe('containsWith — git first, forge only when git cannot tell', () => {
	const forgeThatMustNotBeCalled = (): boolean => {
		throw new Error('the forge was asked when git had already answered');
	};

	it('takes git yes without asking the forge', () => {
		expect(
			containsWith('base', 'head', {
				inGit: () => true,
				viaForge: forgeThatMustNotBeCalled,
			}),
		).toBe(true);
	});

	it('takes git no without asking the forge', () => {
		expect(
			containsWith('base', 'head', {
				inGit: () => false,
				viaForge: forgeThatMustNotBeCalled,
			}),
		).toBe(false);
	});

	it('falls back to the forge only when this clone cannot tell', () => {
		expect(
			containsWith('base', 'head', {
				inGit: () => undefined,
				viaForge: () => true,
			}),
		).toBe(true);
	});

	it('names the refs it could not check instead of crashing opaquely', () => {
		expect(() =>
			containsWith('baselongsha1', 'headlongsha1', {
				inGit: () => undefined,
				viaForge: () => {
					throw new Error('API rate limit exceeded\nsecond line');
				},
			}),
		).toThrow(/could not tell whether baselongs contains headlongs/u);
	});
});

describe('containedInGit', () => {
	const gitThat =
		(behaviour: {
			readonly missing?: string;
			readonly ancestorExit?: number;
		}) =>
		(args: readonly string[]): void => {
			if (args[0] === 'cat-file') {
				if (
					behaviour.missing !== undefined &&
					(args[2] ?? '').startsWith(behaviour.missing)
				) {
					throw new Error('missing object');
				}
				return;
			}
			if (behaviour.ancestorExit !== undefined) {
				throw Object.assign(new Error('not an ancestor'), {
					status: behaviour.ancestorExit,
				});
			}
		};

	it('answers yes when the base already contains the head', () => {
		expect(containedInGit('base', 'head', gitThat({}))).toBe(true);
	});

	it('answers no on git exit 1, which is git saying no', () => {
		expect(
			containedInGit('base', 'head', gitThat({ ancestorExit: 1 })),
		).toBe(false);
	});

	it('cannot tell when git fails for any other reason', () => {
		// Exit 128 is git failing to answer. Reading that as "no" would
		// report an unpublished ref as published, or the reverse.
		expect(
			containedInGit('base', 'head', gitThat({ ancestorExit: 128 })),
		).toBeUndefined();
	});

	it('cannot tell when the commit is not in this clone', () => {
		expect(
			containedInGit('base', 'head', gitThat({ missing: 'head' })),
		).toBeUndefined();
	});
});

describe('publishedInFor across units', () => {
	const stacked = {
		name: 'delendai/wip/claude-opus-5-5/x00642-S2-g1/a-level-head-is-armed',
		sha: 'ccc',
	};
	const containsEverything = () => true;

	it('does not count another unit it was stacked on as its publication', () => {
		expect(
			publishedInFor(
				stacked,
				[
					{
						name: 'delendai/pr/claude-opus-5-5/r00043-S2-g1/adoption',
						sha: 'ddd',
					},
				],
				containsEverything,
			),
		).toBeUndefined();
	});

	it('counts its own slice, or its whole proposal, as its publication', () => {
		for (const name of [
			'delendai/pr/claude-opus-5-5/x00642-S2-g1/a-level-head-is-armed',
			'delendai/pr/claude-opus-5-5/x00642-all-g1/a-derived-conflict',
		]) {
			expect(
				publishedInFor(
					stacked,
					[{ name, sha: 'ddd' }],
					containsEverything,
				),
			).toBe(name);
		}
	});

	it('does not count another generation or model of the same proposal', () => {
		expect(
			publishedInFor(
				stacked,
				[
					{
						name: 'delendai/pr/claude-opus-5-5/x00642-S2-g2/t',
						sha: 'e',
					},
					{
						name: 'delendai/pr/other-model/x00642-S2-g1/t',
						sha: 'f',
					},
				],
				containsEverything,
			),
		).toBeUndefined();
	});

	it('still counts the integration branch once the work merged', () => {
		expect(
			publishedInFor(
				stacked,
				[{ name: 'develop', sha: 'ggg' }],
				containsEverything,
			),
		).toBe('develop');
	});
});

describe('blockingRefs', () => {
	it('lets a published copy pass: the queue reaps it and nothing is lost', () => {
		const stale = { name: 'delendai/wip/m/x00001-S1-g1/t' };
		expect(blockingRefs([stale], [stale])).toEqual([]);
	});

	it("still fails on a ref that may be the only copy of somebody's work", () => {
		const copy = { name: 'delendai/wip/m/x00001-S1-g1/t' };
		const unpublished = { name: 'delendai/wip/m/x00002-S1-g1/t' };
		expect(blockingRefs([copy, unpublished], [copy])).toEqual([
			unpublished,
		]);
	});
});
