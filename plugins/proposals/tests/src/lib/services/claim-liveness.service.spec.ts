/**
 * claim-liveness.service.spec.ts — a claim is a lease: only a live one
 * holds. A quiet, parked, published or delivered unit holds nothing, and
 * neither does a unit without a verdict.
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
		standing('parked-agent', 'waiting'),
		standing(
			'published-agent',
			'idle',
			'delendai/pr/published-agent/review/batch-all-g1/verdicts',
		),
	]);

	it('[<100ms] is yes while its holder is live, local or as the remote copy', () => {
		expect(holds(`refs/heads/${unit('live-agent')}`)).toBe(true);
		expect(holds(`refs/remotes/origin/${unit('live-agent')}`)).toBe(true);
	});

	it('[<100ms] is no for a unit its owner parked: the lease is not live', () => {
		expect(holds(`refs/heads/${unit('parked-agent')}`)).toBe(false);
	});

	it('[<100ms] is no for a published unit whose lease is quiet: it was handed over', () => {
		expect(holds(`refs/heads/${unit('published-agent')}`)).toBe(false);
	});

	it('[<100ms] is no once its holder has gone quiet, has gone, or has landed', () => {
		expect(holds(`refs/heads/${unit('quiet-agent')}`)).toBe(false);
		expect(holds(`refs/remotes/origin/${unit('gone-agent')}`)).toBe(false);
		expect(holds(`refs/heads/${unit('landed-agent')}`)).toBe(false);
	});

	it('[<100ms] is no for a unit nothing has judged', () => {
		expect(holds(`refs/heads/${unit('unknown-agent')}`)).toBe(false);
	});
});
