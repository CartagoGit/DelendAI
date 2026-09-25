/**
 * candidate-disposition.spec.ts — every open candidate has a stated fate,
 * and a red one is never left red only because nobody ran it again.
 */
import { describe, expect, it } from 'vitest';

import {
	candidateDispositions,
	toRefreshForVerdict,
	type ICandidateState,
} from './candidate-disposition';

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
	...over,
});
const fates = (candidates: readonly ICandidateState[]) =>
	candidateDispositions(candidates, PREFIX).map((each) => [
		each.number,
		each.disposition,
	]);

describe('candidateDispositions', () => {
	it('moves the oldest green candidate and queues the rest', () => {
		expect(fates([candidate(8), candidate(3), candidate(5)])).toEqual([
			[3, 'moves-next'],
			[5, 'queued'],
			[8, 'queued'],
		]);
	});

	it('brings forward a red candidate judged against an older integration branch', () => {
		const verdicts = candidateDispositions(
			[candidate(3), candidate(4, { red: true, behind: true })],
			PREFIX,
		);
		expect(verdicts.map((each) => each.disposition)).toEqual([
			'moves-next',
			'refresh-for-verdict',
		]);
		expect(toRefreshForVerdict(verdicts)).toEqual([candidate(4).headRef]);
	});

	it('leaves a red candidate to its author once it was judged against the integration branch', () => {
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

	it('gives a red candidate a fresh verdict again after its author pushes', () => {
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

	it('names drafts, skips a conflicting head, and ignores refs outside the prefix', () => {
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

	it('says why for every candidate', () => {
		for (const verdict of candidateDispositions(
			[candidate(1), candidate(2, { red: true, behind: true })],
			PREFIX,
		)) {
			expect(verdict.why.length).toBeGreaterThan(0);
		}
	});
});
