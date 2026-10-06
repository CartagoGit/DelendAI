/**
 * claim-liveness.service.spec.ts — a claim holds while its holder lives,
 * or while what it did is published; a quiet or delivered unit holds
 * nothing, and a unit without a verdict holds (the cautious reading).
 */
import { describe, expect, it } from 'vitest';

import { fakePartial } from '@delendai/test-kit';

import type { IUnitStandingEntry } from '@delendai/core/cli';

import { holdsFrom } from '../../../../src/lib/services/claim-liveness.service';

const unit = (agent: string): string =>
	`delendai/wip/${agent}/review/batch-all-g1/verdicts`;

const standing = (
	agent: string,
	state: IUnitStandingEntry['standing'],
	publicationRef: string | null = null,
): IUnitStandingEntry =>
	fakePartial<IUnitStandingEntry, 'ref' | 'standing' | 'publicationRef'>({
		ref: unit(agent),
		standing: state,
		publicationRef,
	});

describe('whether a unit holds its claims', () => {
	const holds = holdsFrom([
		standing('live-agent', 'live'),
		standing('quiet-agent', 'idle'),
		standing('gone-agent', 'abandoned'),
		standing('landed-agent', 'delivered'),
		standing(
			'published-agent',
			'idle',
			'delendai/pr/published-agent/review/batch-all-g1/verdicts',
		),
	]);

	it('is yes while its holder is live, local or as the remote copy', () => {
		expect(holds(`refs/heads/${unit('live-agent')}`)).toBe(true);
		expect(holds(`refs/remotes/origin/${unit('live-agent')}`)).toBe(true);
	});

	it('is yes while its publication is open, however quiet its holder', () => {
		expect(holds(`refs/heads/${unit('published-agent')}`)).toBe(true);
	});

	it('is no once its holder has gone quiet, has gone, or has landed', () => {
		expect(holds(`refs/heads/${unit('quiet-agent')}`)).toBe(false);
		expect(holds(`refs/remotes/origin/${unit('gone-agent')}`)).toBe(false);
		expect(holds(`refs/heads/${unit('landed-agent')}`)).toBe(false);
	});

	it('is yes for a unit nothing has judged', () => {
		expect(holds(`refs/heads/${unit('unknown-agent')}`)).toBe(true);
	});
});
