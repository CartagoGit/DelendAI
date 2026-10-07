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
	closedPublicationRetirement,
	containedInGit,
	containsWith,
	failingFor,
	proposalInProgressFor,
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

	it('answers yes when the head adds only merges of commits the base holds', () => {
		expect(
			containedInGit(
				'base',
				'head',
				gitThat({ ancestorExit: 1 }),
				() => true,
			),
		).toBe(true);
	});

	it('answers no on git exit 1, which is git saying no', () => {
		expect(
			containedInGit(
				'base',
				'head',
				gitThat({ ancestorExit: 1 }),
				() => false,
			),
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

describe('proposalInProgressFor', () => {
	const inProgress = new Set(['f00642']);

	it('names a work ref whose proposal the checkout has in progress', () => {
		expect(
			proposalInProgressFor(
				'delendai/wip/claude/f00642-S3-g1/the-branch',
				inProgress,
			),
		).toBe(true);
	});

	it('does not for another proposal, or a name outside the convention', () => {
		expect(
			proposalInProgressFor(
				'delendai/wip/claude/x00001-S1-g1/t',
				inProgress,
			),
		).toBe(false);
		expect(
			proposalInProgressFor('delendai/wip/loose-name', inProgress),
		).toBe(false);
	});
});

describe('refs that name their kind of work (f00644)', () => {
	const kinded = {
		name: 'delendai/wip/claude-opus-5-5/implement/x00642-S2-g1/t',
		sha: 'kkk',
	};

	it('counts the same unit’s publication, reading the kind as a kind', () => {
		expect(
			publishedInFor(
				kinded,
				[
					{
						name: 'delendai/pr/claude-opus-5-5/implement/x00642-all-g1/t',
						sha: 'lll',
					},
				],
				() => true,
			),
		).toBe('delendai/pr/claude-opus-5-5/implement/x00642-all-g1/t');
	});

	it('never takes the kind for the model: another agent’s unit is not its publication', () => {
		expect(
			publishedInFor(
				kinded,
				[
					{
						name: 'delendai/pr/other-model/implement/x00642-S2-g1/t',
						sha: 'mmm',
					},
				],
				() => true,
			),
		).toBeUndefined();
	});
});

describe('failingFor (x00678)', () => {
	const blocking = [
		{ name: 'delendai/pr/glm-5.3-max/x00566-review' },
		{ name: 'delendai/pr/me/implement/x00001-S1-g1/mine' },
	];

	it('fails a pull request only on its own ref, and reports the rest', () => {
		const judged = failingFor(blocking, {
			scope: undefined,
			event: 'pull_request',
			head: 'delendai/pr/me/implement/x00001-S1-g1/mine',
		});
		expect(judged.failing.map((v) => v.name)).toEqual([
			'delendai/pr/me/implement/x00001-S1-g1/mine',
		]);
		expect(judged.reported.map((v) => v.name)).toEqual([
			'delendai/pr/glm-5.3-max/x00566-review',
		]);
	});

	it('does not fail the integration branch\u2019s certification over refs of any unit', () => {
		for (const event of ['push', 'workflow_dispatch', undefined]) {
			const judged = failingFor(blocking, {
				scope: undefined,
				event,
				head: undefined,
			});
			expect(judged.failing).toEqual([]);
			expect(judged.reported).toHaveLength(2);
		}
	});

	it('judges the whole repository in the queue job', () => {
		expect(
			failingFor(blocking, {
				scope: 'repository',
				event: 'schedule',
				head: undefined,
			}).failing,
		).toHaveLength(2);
	});
});

describe('closedPublicationRetirement', () => {
	const policy = {
		namespacePrefix: 'delendai',
		workRefPrefix: 'delendai/wip/',
		publicationRefPrefix: 'delendai/pr/',
	};
	const unit = 'minimax-m3.1/review/batch-all-g4/verdicts';

	it('keeps a closed publication under the retired namespace of its unit', () => {
		expect(
			closedPublicationRetirement(
				`delendai/pr/${unit}`,
				policy,
				new Set([`delendai/pr/${unit}`]),
			),
		).toBe(`refs/delendai/retired/${unit}`);
	});

	it('leaves it while its unit is still on the forge: the author holds it', () => {
		expect(
			closedPublicationRetirement(
				`delendai/pr/${unit}`,
				policy,
				new Set([`delendai/pr/${unit}`, `delendai/wip/${unit}`]),
			),
		).toBeUndefined();
	});

	it('never retires a work ref by this path', () => {
		expect(
			closedPublicationRetirement(
				`delendai/wip/${unit}`,
				policy,
				new Set(),
			),
		).toBeUndefined();
	});
});
