/**
 * candidate-disposition.spec.ts — every open candidate has a stated fate,
 * and a red one is never left red only because nobody ran it again.
 */
import {
	authorsOwn,
	candidateDispositions,
	orphanedCandidates,
	toBringForward,
	type ICandidateState,
} from '@delendai/core/cli';
import { describe, expect, it } from 'vitest';

const PREFIX = 'delendai/pr/';
const candidate = (
	number: number,
	over: Partial<ICandidateState> = {},
): ICandidateState => ({
	number,
	headRef: `delendai/pr/agent/x${String(number)}-S1-g1/t`,
	draft: false,
	red: false,
	conflicting: false,
	behind: false,
	headIsIntegrationMerge: false,
	headIsRegeneration: false,
	overlapping: [],
	...over,
});
const fates = (candidates: readonly ICandidateState[]) =>
	candidateDispositions(candidates, PREFIX).map((each) => [
		each.number,
		each.disposition,
	]);

describe('candidateDispositions', () => {
	it('[<7ms] moves an urgent candidate first whatever its age (x01051 S6)', () => {
		expect(
			fates([candidate(3), candidate(9, { urgent: 'repair' })]),
		).toEqual([
			[9, 'moves-next'],
			[3, 'queued'],
		]);
	});

	it('[<5ms] moves the oldest green candidate and queues the rest', () => {
		expect(fates([candidate(8), candidate(3), candidate(5)])).toEqual([
			[3, 'moves-next'],
			[5, 'queued'],
			[8, 'queued'],
		]);
	});

	it('[<5ms] brings forward a red candidate judged against an older integration branch', () => {
		const verdicts = candidateDispositions(
			[candidate(3), candidate(4, { red: true, behind: true })],
			PREFIX,
		);
		expect(verdicts.map((each) => each.disposition)).toEqual([
			'moves-next',
			'refresh-for-verdict',
		]);
		expect(toBringForward(verdicts)).toEqual([candidate(4).headRef]);
	});

	it('[<12ms] leaves a red candidate to its author once it was judged against the integration branch', () => {
		expect(
			fates([
				candidate(4, { red: true, behind: false }),
				candidate(6, {
					red: true,
					behind: true,
					headIsIntegrationMerge: true,
				}),
			]),
		).toEqual([
			[4, 'author'],
			[6, 'author'],
		]);
	});

	it('[<5ms] gives a red candidate a fresh verdict again after its author pushes', () => {
		expect(
			fates([
				candidate(6, {
					red: true,
					behind: true,
					headIsIntegrationMerge: false,
				}),
			]),
		).toEqual([[6, 'refresh-for-verdict']]);
	});

	it('[<6ms] names drafts, skips a conflicting head, and ignores refs outside the prefix', () => {
		expect(
			fates([
				candidate(1, { draft: true }),
				candidate(2, { conflicting: true }),
				candidate(3),
				{ ...candidate(4), headRef: 'feature/elsewhere' },
			]),
		).toEqual([
			[1, 'draft'],
			[2, 'queued'],
			[3, 'moves-next'],
		]);
	});

	it('[<5ms] says why for every candidate', () => {
		for (const verdict of candidateDispositions(
			[candidate(1), candidate(2, { red: true, behind: true })],
			PREFIX,
		)) {
			expect(verdict.why.length).toBeGreaterThan(0);
		}
	});

	it('[<6ms] brings a queued candidate forward as soon as the integration branch changes a file it changes', () => {
		const verdicts = candidateDispositions(
			[
				candidate(3),
				candidate(5, { behind: true, overlapping: ['src/a.ts'] }),
				candidate(7, { behind: true, overlapping: [] }),
			],
			PREFIX,
		);
		expect(verdicts.map((each) => each.disposition)).toEqual([
			'moves-next',
			'refresh-for-overlap',
			'queued',
		]);
		expect(verdicts[1]?.why).toContain('src/a.ts');
		expect(toBringForward(verdicts)).toEqual([candidate(5).headRef]);
	});

	it('[<5ms] leaves a level candidate queued whatever it overlaps', () => {
		expect(
			fates([
				candidate(3),
				candidate(5, { behind: false, overlapping: ['src/a.ts'] }),
			]),
		).toEqual([
			[3, 'moves-next'],
			[5, 'queued'],
		]);
	});

	it('[<5ms] regenerates a level candidate red only because a derived file is stale', () => {
		const verdicts = candidateDispositions(
			[
				candidate(3),
				candidate(466, {
					red: true,
					failing: ['drift', 'lint-presets', 'delendai-validate'],
				}),
			],
			PREFIX,
		);
		expect(verdicts.map((each) => each.disposition)).toEqual([
			'moves-next',
			'regenerate',
		]);
		expect(verdicts[1]?.why).toContain('drift');
		expect(toBringForward(verdicts)).toEqual([candidate(466).headRef]);
	});

	it('[<5ms] leaves it to its author once regenerated, so nothing loops', () => {
		expect(
			fates([
				candidate(466, {
					red: true,
					failing: ['drift'],
					headIsRegeneration: true,
				}),
			]),
		).toEqual([[466, 'author']]);
	});

	it('[<5ms] does not regenerate a candidate with any other failing check, or only the aggregate', () => {
		expect(
			fates([
				candidate(7, {
					red: true,
					failing: ['drift', 'tests: core 1/2'],
				}),
				candidate(8, { red: true, failing: ['delendai-validate'] }),
			]),
		).toEqual([
			[7, 'author'],
			[8, 'author'],
		]);
	});
});

describe('authorsOwn', () => {
	it("[<5ms] names the agent's own publications handed back to their author, and no one else's", () => {
		const verdicts = [
			{
				number: 1,
				headRef: 'delendai/pr/claude-opus-5-5/implement/x1-all-g1/a',
				disposition: 'author',
				why: '',
			},
			{
				number: 2,
				headRef: 'delendai/pr/minimax-m3/implement/x2-all-g1/b',
				disposition: 'author',
				why: '',
			},
			{
				number: 3,
				headRef: 'delendai/pr/claude-opus-5-5/implement/x3-all-g1/c',
				disposition: 'queued',
				why: '',
			},
		] as const;
		expect(authorsOwn(verdicts, 'delendai/pr/', 'claude-opus-5-5')).toEqual(
			['delendai/pr/claude-opus-5-5/implement/x1-all-g1/a'],
		);
	});
});

describe('orphaned candidates', () => {
	it("[<5ms] a red candidate whose author is there stays the author's", () => {
		expect(fates([candidate(1, { red: true })])).toEqual([[1, 'author']]);
	});

	it("[<7ms] a red candidate whose author is gone is orphaned, not the author's", () => {
		const verdicts = candidateDispositions(
			[
				candidate(1, {
					red: true,
					authorGone: 'finished: its unit ended',
				}),
				candidate(2, {
					red: true,
					behind: true,
					headIsIntegrationMerge: true,
					authorGone: 'idle-past-window: silent',
				}),
				candidate(3, {
					red: true,
					authorGone: 'out-of-quota: no life since',
				}),
			],
			PREFIX,
		);
		expect(verdicts.map((each) => each.disposition)).toEqual([
			'orphaned',
			'orphaned',
			'orphaned',
		]);
		expect(orphanedCandidates(verdicts)).toHaveLength(3);
		expect(verdicts[0]?.why).toContain('finished');
	});

	it('[<5ms] a red candidate owed a fresh verdict is brought forward whoever its author is', () => {
		expect(
			fates([
				candidate(1, {
					red: true,
					behind: true,
					authorGone: 'finished',
				}),
			]),
		).toEqual([[1, 'refresh-for-verdict']]);
	});
});

describe('candidates under both prefixes in a namespace transition (f00808)', () => {
	it('[<5ms] disposes of a former-prefix candidate beside a current one', () => {
		const both = [
			candidate(1, { headRef: 'delendai/pr/agent/x1-S1-g1/t' }),
			candidate(2, { headRef: 'pr/agent/x2-S1-g1/t' }),
			candidate(3, { headRef: 'feature/x3' }),
		];
		expect(
			candidateDispositions(both, ['pr/', 'delendai/pr/']).map(
				(each) => each.number,
			),
		).toEqual([1, 2]);
		expect(
			authorsOwn(
				[
					{
						number: 2,
						headRef: 'pr/agent/x2-S1-g1/t',
						disposition: 'author',
						why: '',
					},
				],
				['pr/', 'delendai/pr/'],
				'agent',
			),
		).toEqual(['pr/agent/x2-S1-g1/t']);
	});
});
