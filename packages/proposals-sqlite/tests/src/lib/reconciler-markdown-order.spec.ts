/**
 * reconciler-markdown-order.spec.ts — plan and slice candidates sort by
 * code units, so keys the locale calls equal still have one order.
 */
import { describe, expect, it } from 'vitest';

import { fakePartial } from '@delendai/test-kit';

import {
	canonicalPlanCandidates,
	canonicalSliceCandidates,
	type IPlanCandidate,
	type ISliceCandidate,
} from '../../../src/lib/reconciler-markdown';

// Canonically equivalent: `localeCompare` answers 0 for every pair.
const NFC = 'é';
const NFD = 'é';

const plan = (uid: string): IPlanCandidate => ({
	uid,
	proposalUid: 'p',
	slug: 's',
	path: 'p.md',
	title: 't',
	status: 'draft',
});

describe('canonical candidate order', () => {
	it('orders plans the locale ties the same in both insertion orders', () => {
		const uids = (plans: readonly IPlanCandidate[]) =>
			canonicalPlanCandidates(plans).map((candidate) => candidate.uid);
		expect(uids([plan(NFC), plan(NFD)])).toEqual([NFD, NFC]);
		expect(uids([plan(NFD), plan(NFC)])).toEqual([NFD, NFC]);
	});

	it('orders slices the locale ties the same in both insertion orders', () => {
		const slice = (uid: string) =>
			fakePartial<ISliceCandidate>({ uid, path: 'p.md' });
		const uids = (slices: readonly ISliceCandidate[]) =>
			canonicalSliceCandidates(slices).map((candidate) => candidate.uid);
		expect(uids([slice(NFC), slice(NFD)])).toEqual([NFD, NFC]);
		expect(uids([slice(NFD), slice(NFC)])).toEqual([NFD, NFC]);
	});
});
